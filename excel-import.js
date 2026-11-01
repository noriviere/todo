// Import du fichier Excel historique (ToDoList.xlsm) dans l'appli.
// Feuilles lues : "To do list" (en cours) et "Archive" (sujets et tâches terminés, importés archivés).
// Une ligne A / P / I = un sujet, les lignes S qui suivent = ses tâches.
//   P (projet avec % d'objectif) → P1, I → P2, A → P3
//   Etat : A faire, En cours (avec le % de Tx avcmt), En attente, Fait, Annulé repris tels quels
//   Délais → deadline, Tps (heures) → temps estimé, Date → date de création,
//   Commentaires → notes (ainsi que le suivi « -> … » des titres trop longs), Projet (→ Code) / Secteur / Produit fini → paramètres du sujet (filtres).
// La lecture du fichier utilise SheetJS (vendor/xlsx.mini.min.js), chargé seulement au moment de l'import.
(function () {
  'use strict';
  const A = typeof window !== 'undefined' ? window.todoApp : null;

  const SHEETS = [{ name: 'To do list', archived: false }, { name: 'Archive', archived: true }];
  const PRIO_BY_TYPE = { P: 1, I: 2, A: 3 };
  const STATE = { 'a faire': 'todo', 'à faire': 'todo', 'en cours': 'doing', 'en attente': 'waiting', 'fait': 'done', 'annulé': 'cancelled', 'annule': 'cancelled' };
  const COLS = { date: 'date', etat: 'etat', projet: 'projet', secteur: 'secteur', 'produit fini': 'produit', sujet: 'sujet', 'délais': 'delai', 'tx avcmt': 'avct', tps: 'tps', commentaires: 'comm' };

  const { pad } = typeof window !== 'undefined' ? window.todoMetier : require('./metier.js');
  const norm = v => String(v ?? '').trim().toLowerCase();
  const text = v => v == null ? '' : String(v).replace(/\r/g, '').trim();
  // Numéro de série Excel (jours depuis le 30/12/1899) → AAAA-MM-JJ
  function serialDate(v) {
    if (typeof v !== 'number' || !isFinite(v) || v < 1) return null;
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v + 1e-6) * 86400000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const iso = ymd => ymd ? ymd + 'T09:00:00.000Z' : null;
  // Première ligne du texte = titre, le reste part dans les notes
  function splitTitle(v) {
    const lines = text(v).split('\n').map(s => s.trim()).filter(Boolean);
    return { title: lines[0] || '', rest: lines.slice(1).join('\n') };
  }
  const tag = v => { const s = text(v); return s && s !== 'N/A' ? s : ''; };

  function headerMap(row) {
    const m = { type: 0 };
    (row || []).forEach((h, i) => { const k = COLS[norm(h)]; if (k && m[k] == null) m[k] = i; });
    return m;
  }

  // rowsBySheet : { "To do list": [[...], ...], "Archive": [...] } (valeurs brutes, dates en numéros de série)
  function mapWorkbook(rowsBySheet, opts = {}) {
    const uid = opts.uid || (() => Math.random().toString(36).slice(2));
    const now = opts.now || new Date().toISOString();
    const subjects = [], tasks = [], skipped = [];
    for (const sh of SHEETS) {
      const rows = rowsBySheet[sh.name];
      if (!rows || !rows.length) continue;
      const c = headerMap(rows[0]);
      if (c.sujet == null || c.etat == null) throw new Error(`colonnes « Sujet » / « Etat » introuvables dans la feuille ${sh.name}`);
      let cur = null;
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i] || [];
        const type = text(r[c.type]).toUpperCase();
        const etat = norm(r[c.etat]);
        const { title, rest } = splitTitle(r[c.sujet]);
        if (!type && !title) continue;
        const created = serialDate(r[c.date]);
        const comm = text(r[c.comm]);
        const src = { type: 'excel', sheet: sh.name, row: i + 1 };
        if (PRIO_BY_TYPE[type]) {
          const closed = etat === 'fait' || etat === 'annulé' || etat === 'annule';
          cur = {
            id: uid(), title: title || '(sujet sans titre)', priority: PRIO_BY_TYPE[type],
            description: [rest, comm].filter(Boolean).join('\n'),
            code: tag(r[c.projet]), secteur: tag(r[c.secteur]), produit: tag(r[c.produit]),
            archived: sh.archived || closed, archivedAt: sh.archived || closed ? (iso(created) || now) : null,
            createdAt: iso(created) || now, updatedAt: now, source: src
          };
          subjects.push(cur);
          continue;
        }
        if (type !== 'S') { skipped.push({ sheet: sh.name, row: i + 1, why: 'type de ligne inconnu' }); continue; }
        if (!title) { skipped.push({ sheet: sh.name, row: i + 1, why: 'tâche sans texte' }); continue; }
        // Titre très long du type « action -> suivi -> suivi » : on garde l'action en titre, le suivi va dans les notes
        let tTitle = title, follow = '';
        const arrow = title.indexOf('->');
        if (title.length > 80 && arrow > 5) { tTitle = title.slice(0, arrow).trim(); follow = 'Suivi : ' + title.slice(arrow); }
        let status = STATE[etat] || 'todo';
        const avct = typeof r[c.avct] === 'number' ? r[c.avct] : 0;
        const progress = status === 'doing' ? Math.max(0, Math.min(99, Math.round(avct * 100))) : 0;
        const deadline = serialDate(r[c.delai]);
        const tps = typeof r[c.tps] === 'number' && r[c.tps] > 0 ? Math.round(r[c.tps] * 60) : null;
        const closed = status === 'done' || status === 'cancelled';
        const when = iso(deadline || created) || now;
        tasks.push({
          id: uid(), subjectId: cur ? cur.id : null, title: tTitle,
          notes: [follow, rest, comm].filter(Boolean).join('\n'),
          deadline, estimateMin: tps, status, progress,
          archived: sh.archived, archivedAt: sh.archived ? when : null,
          createdAt: iso(created) || now, updatedAt: now, doneAt: closed ? when : null,
          source: src
        });
      }
    }
    return { subjects, tasks, skipped };
  }

  if (typeof module !== 'undefined') module.exports = { mapWorkbook };
  if (!A || !A.hooks) return;

  /* ---------- Lecture du fichier ---------- */
  let libReady = null;
  function loadLib() {
    if (window.XLSX) return Promise.resolve();
    return libReady || (libReady = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'vendor/xlsx.mini.min.js';
      s.onload = res;
      s.onerror = () => { libReady = null; rej(new Error('impossible de charger le lecteur Excel (vérifie la connexion)')); };
      document.head.appendChild(s);
    }));
  }
  async function readFile(f) {
    await loadLib();
    const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
    const rows = {};
    for (const sh of SHEETS) {
      const ws = wb.Sheets[sh.name];
      if (ws) rows[sh.name] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    }
    if (!rows['To do list']) throw new Error('feuille « To do list » introuvable');
    return mapWorkbook(rows, { uid: A.uid, now: A.nowIso() });
  }

  /* ---------- Carte sur la page Données ---------- */
  let preview = null;   // résultat lu, en attente de confirmation
  let fileName = '';

  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.xlsx,.xlsm'; input.hidden = true;
  document.body.appendChild(input);
  input.addEventListener('change', async () => {
    const f = input.files[0];
    input.value = '';
    if (!f) return;
    try {
      preview = await readFile(f);
      fileName = f.name;
      A.render();
    } catch (err) {
      alert('Lecture du fichier Excel impossible : ' + err.message);
    }
  });

  function summary(p) {
    const openS = p.subjects.filter(s => !s.archived), arcS = p.subjects.length - openS.length;
    const live = p.tasks.filter(t => !t.archived);
    const open = live.filter(t => A.isOpen(t));
    const late = open.filter(t => t.deadline && t.deadline < A.today()).length;
    const byP = n => openS.filter(s => s.priority === n).length;
    const wait = open.filter(t => t.status === 'waiting').length;
    return `<p>Lu dans <b>${A.esc(fileName)}</b> :</p>
      <ul style="margin:6px 0 10px 18px;line-height:1.6">
        <li><b>${openS.length}</b> sujets actifs (P1 : ${byP(1)}, P2 : ${byP(2)}, P3 : ${byP(3)}) et ${arcS} sujets terminés, mis aux archives</li>
        <li><b>${open.length}</b> tâches ouvertes, dont ${late} en retard et ${wait} en attente</li>
        <li>${live.length - open.length} tâches faites ou annulées sous les sujets actifs, ${p.tasks.length - live.length} tâches archivées</li>
        ${p.skipped.length ? `<li>${p.skipped.length} ligne(s) vide(s) ignorée(s)</li>` : ''}
      </ul>`;
  }

  function card() {
    const has = A.getData().subjects.length + A.getData().tasks.length;
    const steps = A.getData().subjects.filter(s => (s.parentId || s.isProject) && !s.archived).length;
    if (preview) {
      return `<div class="card"><h3 data-repere="excel">Import depuis Excel</h3>${summary(preview)}
        <p>${has ? `Tu as déjà ${A.getData().subjects.length} sujets et ${A.getData().tasks.length} tâches dans l'appli. « Remplacer » repart de ton Excel seul, « Ajouter » garde aussi ce qui existe. Dans les deux cas l'état actuel est gardé et tu peux revenir en arrière.` : ''}</p>
        ${steps ? `<p class="hint">⚠ « Remplacer » retire aussi tes ${steps} sujet${steps > 1 ? 's' : ''} organisé${steps > 1 ? 's' : ''} en sous-sujets ou en projets (avec leur planning, leurs liens et leurs jalons). Préfère « Ajouter » pour les garder.</p>` : ''}
        <button class="btn primary" data-xl="replace">${has ? 'Remplacer mes données' : 'Importer'}</button>
        ${has ? '<button class="btn" data-xl="add">Ajouter à mes données</button>' : ''}
        <button class="btn" data-xl="cancel">Annuler</button></div>`;
    }
    const already = A.getData().subjects.some(s => s.source && s.source.type === 'excel');
    return `<div class="card"><h3 data-repere="excel">Import depuis Excel</h3>
      <p>Reprend ton fichier ToDoList.xlsm : chaque ligne A, P ou I devient un sujet (P → P1, I → P2, A → P3), les lignes S en dessous deviennent ses tâches, avec échéance, temps estimé, état et commentaires. Les colonnes Projet (appelée Code dans l'appli), Secteur et Produit fini deviennent des paramètres du sujet pour filtrer. La feuille Archive est importée dans les archives. Tu verras un résumé avant de confirmer.</p>
      ${already ? '<p class="hint">Ton Excel a déjà été importé. Réimporter avec « Ajouter » créerait des doublons : utilise plutôt « Remplacer ».</p>' : ''}
      <button class="btn" data-xl="pick">Importer un fichier Excel…</button></div>`;
  }

  // Aperçu d'un import déjà lu (utilisé aussi par les tests)
  A.excelPreview = p => { preview = p; A.render(); };

  window.addEventListener('todo:rendered', () => {
    const el = document.getElementById('excel-import-card');
    if (el) el.innerHTML = card();
  });

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-xl]');
    if (!b) return;
    const act = b.dataset.xl;
    if (act === 'pick') { input.click(); return; }
    if (act === 'cancel') { preview = null; A.render(); return; }
    if (!preview) return;
    const cur = A.getData();
    const base = act === 'add'
      ? JSON.parse(JSON.stringify(cur))
      : Object.assign(JSON.parse(JSON.stringify(cur)), { subjects: [], tasks: [] });
    base.subjects = base.subjects.concat(preview.subjects);
    base.tasks = base.tasks.concat(preview.tasks);
    const n = preview.tasks.length;
    preview = null;
    // Un seul pas dans l'historique : Ctrl+Z défait tout l'import ; la copie « avant import » reste gardée
    A.modifier(`Import Excel (${n} tâches)`, d => { d.ui.expanded = []; return base; },
      { copie: true, toast: `Import terminé : ${n} tâches reprises de ton Excel`, lieu: { vue: 'sujets', tid: null, sid: null } });
  });
})();
