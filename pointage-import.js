// Import de l'historique de pointage tenu dans Excel (une feuille par année).
// Colonnes repérées par leur en-tête : Date, Arrivé, Midi (début), Midi (fin), Départ, CP (1 = journée de CP).
// La colonne juste après CP contient le type d'absence en texte : Férié (ignoré, calculé par l'appli), Arret / Maladie,
// Naissance, Congé pat, Sans solde… Les cellules « CP N » et « CP N-1 » donnent les droits de l'année de la feuille.
// Les jours déjà présents dans l'appli sont gardés tels quels ; l'import ne fait que compléter.
(function () {
  'use strict';
  const A = typeof window !== 'undefined' ? window.todoApp : null;

  const { pad } = typeof window !== 'undefined' ? window.todoMetier : require('./metier.js');
  const norm = v => String(v ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  function serialDate(v) {
    if (typeof v !== 'number' || !isFinite(v) || v < 1) return null;
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v + 1e-6) * 86400000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  function addDay(ds) { const [y, m, d] = ds.split('-').map(Number); const x = new Date(Date.UTC(y, m - 1, d + 1)); return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`; }
  // Heure Excel (fraction de jour) ou texte « 8:30 » → « 08:30 »
  function hm(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number' && isFinite(v)) {
      const m = Math.round((v % 1) * 1440);
      if (m <= 0 || m >= 1440) return null;
      return pad(Math.floor(m / 60)) + ':' + pad(m % 60);
    }
    const r = String(v).trim().match(/^(\d{1,2})\s*[:h]\s*(\d{2})/);
    return r && +r[1] < 24 ? pad(+r[1]) + ':' + r[2] : null;
  }
  // Texte d'absence → type de l'appli (null = jour férié, déjà calculé par l'appli)
  function absType(s) {
    const n = norm(s);
    if (!n) return undefined;
    if (/^ferie/.test(n)) return null;
    if (/arret|maladie/.test(n)) return 'maladie';
    if (/naissance/.test(n)) return 'naissance';
    if (/pat/.test(n)) return 'paternite';
    if (/sans.?solde/.test(n)) return 'sanssolde';
    if (/^rtt/.test(n)) return 'rtt';
    if (/^cp\b|conges? payes?/.test(n)) return 'cp';
    if (/recup/.test(n)) return 'recup';
    return 'autre:' + String(s).trim();
  }

  // rowsBySheet : { nom de feuille: [[cellules]] } (valeurs brutes, sans en-têtes interprétés)
  function parse(rowsBySheet) {
    const days = {}, rights = {}, unknown = {};
    let sheets = 0;
    for (const [name, rows] of Object.entries(rowsBySheet)) {
      const head = (rows[0] || []).map(norm);
      const c = { date: head.indexOf('date'), in: head.findIndex(h => /^arrive/.test(h)), out: head.findIndex(h => /^depart/.test(h)), cp: head.indexOf('cp') };
      const midi = head.map((h, i) => h === 'midi' ? i : -1).filter(i => i >= 0);
      if (c.date < 0 || c.in < 0) continue;
      sheets++;
      c.lo = midi[0] ?? -1; c.li = midi[1] ?? -1;
      const abs = c.cp >= 0 ? c.cp + 1 : -1;
      const years = {};
      let cpN = null, cpN1 = null;
      let lastDs = null;
      rows.forEach((r, i) => {
        // Cellules de droits « CP N » / « CP N-1 », n'importe où sur la ligne, valeur dans la cellule à droite
        (r || []).forEach((v, j) => {
          const n = norm(v);
          if (n === 'cp n' && typeof r[j + 1] === 'number') cpN = r[j + 1];
          if (n === 'cp n-1' && typeof r[j + 1] === 'number') cpN1 = r[j + 1];
        });
        if (i === 0) return;
        // Lignes de week-end sans date (ex. « Congé pat » en jours calendaires) : date déduite de la ligne au-dessus
        // (seulement si la cellule Date est vide et que le jour déduit est un samedi ou un dimanche : une ligne « Total » n'est pas un jour)
        let ds = serialDate(r[c.date]);
        const noDate = r[c.date] == null || r[c.date] === '';
        if (!ds && noDate && lastDs && (r || []).some(v => v != null && v !== '')) {
          const nx = addDay(lastDs), wd = new Date(nx + 'T12:00:00').getDay();
          if (wd === 0 || wd === 6) ds = nx;
        }
        if (!ds) { lastDs = null; return; }
        lastDs = ds;
        years[ds.slice(0, 4)] = (years[ds.slice(0, 4)] || 0) + 1;
        const d = {};
        let tIn = hm(r[c.in]), lo = c.lo >= 0 ? hm(r[c.lo]) : null, li = c.li >= 0 ? hm(r[c.li]) : null, out = c.out >= 0 ? hm(r[c.out]) : null;
        // Demi-journée sans après-midi : le premier « Midi » est l'heure de départ
        if (lo && !li && !out) { out = lo; lo = null; }
        if (tIn) d.in = tIn;
        if (lo) d.lunchOut = lo;
        if (li) d.lunchIn = li;
        if (out) d.out = out;
        const cp = c.cp >= 0 ? r[c.cp] : null;
        const txt = abs >= 0 && typeof r[abs] === 'string' ? r[abs].trim() : '';
        const t = absType(txt);
        if (typeof cp === 'number' && cp > 0) d.abs = { type: 'cp', part: cp < 1 ? 'am' : 'full' };
        else if (t) {
          // Absence notée un jour où des heures sont pointées (arrêt en cours de journée…) : on garde les heures, l'absence va en note
          if (d.in) d.note = txt;
          else d.abs = { type: t, part: 'full' };
          if (t.startsWith('autre:')) unknown[t] = (unknown[t] || 0) + 1;
        }
        if (!Object.keys(d).length) return;
        const prev = days[ds];
        // Date présente deux fois (deux onglets) : on garde la ligne la plus complète en entier, sans mélanger les heures
        days[ds] = prev && Object.keys(prev).length >= Object.keys(d).length ? prev : d;
      });
      const y = Object.entries(years).sort((a, b) => b[1] - a[1])[0];
      if (y && (cpN != null || cpN1 != null)) rights[y[0]] = { acq: cpN, n1: cpN1, sheet: name };
    }
    return { days, rights, unknown, sheets };
  }
  if (typeof module !== 'undefined') module.exports = { parse };
  if (!A || !A.pointage) return;

  /* ---------- Interface (onglet Pointage > Bilan) ---------- */
  let preview = null, libReady = null;
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
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.xlsx,.xlsm,.xls'; input.hidden = true;
  document.body.appendChild(input);
  input.addEventListener('change', async () => {
    const f = input.files[0];
    input.value = '';
    if (!f) return;
    try {
      await loadLib();
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      const rows = {};
      wb.SheetNames.forEach(n => { rows[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null }); });
      const p = parse(rows);
      if (!Object.keys(p.days).length) throw new Error("aucune feuille avec des colonnes « Date » et « Arrivé » n'a été trouvée");
      preview = Object.assign(p, { fileName: f.name });
      A.render();
    } catch (err) { alert('Import impossible : ' + err.message); }
  });

  const fmtJ = n => (Math.round(n * 10) / 10).toLocaleString('fr-FR') + ' j';
  const shortD = ds => A.parseYmd(ds).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  function summary(p) {
    const cur = A.pointage.P().days;
    const keys = Object.keys(p.days).sort();
    const fresh = keys.filter(ds => !cur[ds]);
    const worked = fresh.filter(ds => p.days[ds].in).length;
    const byType = {};
    fresh.forEach(ds => { const a = p.days[ds].abs; if (a) byType[a.type] = (byType[a.type] || 0) + (a.part === 'full' ? 1 : 0.5); });
    const label = t => t.startsWith('autre:') ? t.slice(6) + ' (nouveau type)' : A.pointage.type(t).label;
    return `<p>Lu dans <b>${A.esc(p.fileName)}</b> (${p.sheets} feuille${p.sheets > 1 ? 's' : ''}), du ${shortD(keys[0])} au ${shortD(keys[keys.length - 1])} :</p>
      <ul style="margin:6px 0 10px 18px;line-height:1.6">
        <li><b>${worked}</b> jours avec des heures pointées</li>
        ${Object.entries(byType).map(([t, n]) => `<li>${A.esc(label(t))} : <b>${fmtJ(n)}</b></li>`).join('')}
        ${Object.entries(p.rights).map(([y, r]) => `<li>Droits CP ${y} : ${r.acq ?? '?'} j, report N-1 : ${r.n1 ?? '?'} j</li>`).join('')}
        ${keys.length - fresh.length ? `<li>${keys.length - fresh.length} jour(s) déjà saisis dans l'appli : gardés tels quels</li>` : ''}
      </ul>
      <p class="hint">Les jours fériés ne sont pas repris : l'appli les calcule toute seule.</p>`;
  }
  function card() {
    if (preview) return `<div class="card"><h3>Import de l'historique</h3>${summary(preview)}
      <button class="btn primary" data-pti="go">Importer</button> <button class="btn" data-pti="cancel">Annuler</button></div>`;
    return `<div class="card"><h3>Importer un historique Excel</h3>
      <p>Reprend ton ancien fichier de pointage (une feuille par année) : heures d'arrivée, de repas et de départ, CP, absences et droits CP N / N-1. Les jours déjà saisis ici ne sont pas touchés. Tu verras un résumé avant de confirmer.</p>
      <button class="btn" data-pti="pick">Choisir le fichier Excel…</button></div>`;
  }
  window.addEventListener('todo:rendered', () => {
    const el = document.getElementById('pt-import');
    if (el) el.innerHTML = card();
  });
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-pti]');
    if (!b) return;
    const act = b.dataset.pti;
    if (act === 'pick') { input.click(); return; }
    if (act === 'cancel') { preview = null; A.render(); return; }
    if (act !== 'go' || !preview) return;
    A.pointage.P();
    const base = JSON.parse(JSON.stringify(A.getData()));
    const pt = base.pointage;
    let n = 0;
    for (const [ds, d] of Object.entries(preview.days)) {
      if (pt.days[ds]) continue;
      if (d.abs && d.abs.type.startsWith('autre:')) {
        const lbl = d.abs.type.slice(6);
        let t = pt.types.find(x => x.label.toLowerCase() === lbl.toLowerCase());
        if (!t) { t = { id: 'ty' + A.uid().slice(-6), label: lbl, short: '', color: '#9aa1b2', counted: false }; pt.types.push(t); }
        d.abs.type = t.id;
      }
      pt.days[ds] = d; n++;
    }
    for (const [y, r] of Object.entries(preview.rights)) {
      const cur = (pt.rights.cp || (pt.rights.cp = {}))[y] || (pt.rights.cp[y] = {});
      if (cur.acq == null && r.acq != null) cur.acq = r.acq;
      if (cur.n1 == null && r.n1 != null) cur.n1 = r.n1;
    }
    preview = null;
    A.replaceData(base);
    A.toast(`Import terminé : ${n} jours repris de ton fichier`);
  });
})();
