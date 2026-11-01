// Organisation : filtres rapides du tableau de bord, glisser-déposer, tâches récurrentes.
(function () {
  'use strict';
  const A = window.todoApp;
  if (!A || !A.hooks || !A.hooks.dashFilter) return;
  const { esc, today, addDays, parseYmd, ymd } = A;
  const db = () => A.getData();
  const isOpen = A.isOpen;
  const view = () => location.hash.slice(1) || 'dashboard';

  const css = document.createElement('style');
  css.textContent = `
.org-filters{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:-8px 0 18px}
.org-filters .chip{font-weight:600}
.org-filters .chip.p1.on{background:var(--p1-bg);border-color:var(--p1);color:var(--p1)}
.org-filters .chip.p2.on{background:var(--p2-bg);border-color:var(--p2);color:var(--p2)}
.org-filters .chip.p3.on{background:var(--p3-bg);border-color:var(--p3);color:var(--p3)}
.org-filters select,.org-filters input{border:1px solid var(--border);background:var(--surface);border-radius:20px;padding:4px 10px;font-size:12px;outline:none}
.org-filters input{flex:0 1 200px;min-width:0}
.org-filters select{max-width:min(100%,280px);min-width:0;text-overflow:ellipsis}
.org-filters .chip.inb{display:inline-flex;align-items:center;gap:5px}
.org-filters .chip svg{width:14px;height:14px}
.org-filters input:focus,.org-filters select:focus{border-color:var(--accent)}
.org-filters .clear{border:0;background:none;color:var(--accent);font-size:12px;text-decoration:underline}
.org-grip{cursor:grab;color:var(--faint);opacity:0;user-select:none;font-size:13px;letter-spacing:-2px;padding:0 3px;margin-left:-8px}
.task:hover .org-grip,.s-head:hover .org-grip{opacity:1}
.org-dragging{opacity:.4}
.org-before{box-shadow:inset 0 3px 0 var(--accent)}
/* Sujets et sous-sujets : un trait d'insertion qui glisse entre les cartes */
.org-zone{position:relative}
.org-line{position:absolute;left:0;top:0;height:3px;border-radius:3px;background:var(--accent);pointer-events:none;z-index:5;
  transition:transform .12s ease-out,width .12s ease-out;box-shadow:0 0 0 2px color-mix(in srgb,var(--accent) 18%,transparent)}
.org-line::before{content:"";position:absolute;left:-5px;top:-3.5px;width:10px;height:10px;border-radius:50%;background:var(--surface);border:2.5px solid var(--accent);box-sizing:border-box}
.org-into{outline:2px dashed var(--accent);outline-offset:-2px;border-radius:8px}
@media (prefers-reduced-motion:reduce){.org-line{transition:none}}
.org-recur{color:var(--accent);font-size:13px;padding:0 2px;cursor:default}
`;
  document.head.appendChild(css);

  /* ================= Filtres du tableau de bord ================= */
  const F = () => {
    const ui = db().ui;
    if (!ui.dashFilter) ui.dashFilter = { prios: [], subjectId: '', q: '' };
    return ui.dashFilter;
  };
  const active = f => f.prios.length || f.subjectId || f.q.trim();

  A.hooks.dashFilter.push(t => {
    const f = F();
    if (!active(f)) return true;
    const s = A.subj(t.subjectId);
    if (f.prios.length && !f.prios.includes(s && !s.archived ? s.priority : 0)) return false;
    // Filtre sur un sujet parent : ses sous-sujets compris
    if (f.subjectId && t.subjectId !== f.subjectId && !(s && s.parentId === f.subjectId && A.parentOf(s))) return false;
    const q = f.q.trim().toLowerCase();
    if (q && !(`${t.title} ${t.notes || ''} ${s ? s.title : ''}`.toLowerCase().includes(q))) return false;
    return true;
  });

  A.hooks.dashTop.push(() => {
    const f = F();
    const chip = (v, label, cls) => `<button type="button" class="chip ${cls} ${f.prios.includes(v) ? 'on' : ''}" data-org-prio="${v}">${label}</button>`;
    const subs = db().subjects.filter(s => !s.archived).sort((a, b) => a.priority - b.priority || A.subjLabel(a).localeCompare(A.subjLabel(b), 'fr'));
    return `<div class="org-filters" data-repere="filtres">
      ${chip(1, 'P1', 'p1')}${chip(2, 'P2', 'p2')}${chip(3, 'P3', 'p3')}${chip(0, A.ICON.inbox + 'À ranger', 'inb')}
      <select data-org-subj data-k="org-subj" title="Filtrer sur un sujet">
        <option value="">Tous les sujets</option>
        ${subs.map(s => `<option value="${s.id}" ${s.id === f.subjectId ? 'selected' : ''}>P${s.priority} · ${esc(A.subjLabel(s))}</option>`).join('')}
      </select>
      <input data-org-q data-k="org-q" placeholder="Filtrer par mot…" value="${esc(f.q)}">
      ${active(f) ? '<button type="button" class="clear" data-org-clear>Effacer les filtres</button>' : ''}
    </div>`;
  });

  document.addEventListener('click', e => {
    const p = e.target.closest('[data-org-prio]');
    if (p) {
      const f = F(), v = +p.dataset.orgPrio;
      f.prios = f.prios.includes(v) ? f.prios.filter(x => x !== v) : [...f.prios, v];
      A.enregistrerAffichage(); A.render(); return;
    }
    if (e.target.closest('[data-org-clear]')) {
      db().ui.dashFilter = { prios: [], subjectId: '', q: '' };
      A.enregistrerAffichage(); A.render(); return;
    }
    if (e.target.closest('[data-org-autoorder]')) {
      A.modifier('Sujets reclassés par urgence', d => { d.subjects.forEach(s => { s.order = 0; }); }, { toast: 'Sujets reclassés par urgence' });
      return;
    }
  });
  document.addEventListener('input', e => {
    if (e.target.matches('[data-org-q]')) { F().q = e.target.value; A.enregistrerAffichage(); A.scheduleRender(); }
  });
  document.addEventListener('change', e => {
    if (e.target.matches('[data-org-subj]')) { F().subjectId = e.target.value; A.enregistrerAffichage(); A.render(); }
  });

  // Bouton pour revenir au tri automatique des sujets après un glisser-déposer
  A.hooks.subjectsToolbar.push(() =>
    db().subjects.some(s => !s.archived && s.order)
      ? '<button class="btn" data-org-autoorder title="Oublier l\'ordre manuel et reclasser par urgence">Ordre auto</button>' : '');

  /* ================= Glisser-déposer ================= */
  // Tâche → autre tâche : se place juste avant (prend sa deadline, et son sujet sur la page Sujets)
  // Tâche → en-tête d'un sujet : rangée dans ce sujet
  // Tâche → section Aujourd'hui / Demain / 7 prochains jours / Sans deadline : nouvelle deadline
  // Sujet → place dans un groupe P1/P2/P3 (trait d'insertion) : prend la priorité du groupe
  // Sous-sujet → place parmi les sous-sujets d'un parent (le sien ou un autre), ou en-tête d'un autre sujet : y est rangé
  let drag = null;

  // Poignées en tête de chaque ligne de tâche et de chaque en-tête de sujet, sauf dans Archives
  const poignee = () => view() === 'archives' ? '' : '<span class="org-grip" title="Glisser pour déplacer">⋮⋮</span>';
  A.hooks.debutLigneTache.push(poignee);
  A.hooks.debutEnteteSujet.push(poignee);

  document.addEventListener('mousedown', e => {
    const g = e.target.closest('.org-grip');
    if (!g) return;
    const el = g.closest('.task[data-tid]') || g.closest('.subject[data-sid]');
    if (el) el.draggable = true;
  });
  document.addEventListener('mouseup', () => {
    if (!drag) document.querySelectorAll('[draggable="true"]').forEach(x => { x.draggable = false; });
  });
  document.addEventListener('dragstart', e => {
    const el = e.target;
    if (!el.draggable) return;
    if (el.matches('.task[data-tid]')) drag = { kind: 'task', id: el.dataset.tid, el };
    else if (el.matches('.subject[data-sid]')) drag = { kind: 'subject', id: el.dataset.sid, el, child: el.classList.contains('child') };
    else return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', drag.id);
    setTimeout(() => el.classList.add('org-dragging'), 0);
  });
  // Trait d'insertion unique, déplacé d'une position à l'autre (sujets et sous-sujets)
  const line = document.createElement('div');
  line.className = 'org-line';
  function clearMarks() {
    document.querySelectorAll('.org-before,.org-into').forEach(x => x.classList.remove('org-before', 'org-into'));
    document.querySelectorAll('.org-zone').forEach(x => x.classList.remove('org-zone'));
    line.remove(); line._key = null;
  }
  document.addEventListener('dragend', () => {
    if (drag) { drag.el.classList.remove('org-dragging'); drag.el.draggable = false; }
    drag = null; clearMarks();
  });

  const SEC_DROP = ['today', 'tomorrow', 'week', 'nodate'];
  const cards = zone => [...zone.children].filter(x => x.matches('.subject[data-sid]'));
  // Sujet glissé : zone = groupe P1/P2/P3 (premier niveau) ou liste des sous-sujets d'un parent.
  // La place se lit à la hauteur du pointeur (milieu des cartes), donc on vise aussi les interstices.
  function subjectTarget(e) {
    const t = e.target, s = A.subj(drag.id);
    if (!s) return null;
    let zone, parent = null;
    if (drag.child) {
      zone = t.closest('#main .s-children');
      if (zone) parent = A.subj(zone.closest('.subject[data-sid]').dataset.sid);
      else {
        // En-tête d'un autre sujet de premier niveau (même replié) : rangé à la fin de ses sous-sujets
        const head = t.closest('#main .subject[data-sid]:not(.child) > .s-head');
        const hp = head && A.subj(head.parentElement.dataset.sid);
        if (hp && hp.id !== s.parentId && A.canNest(s, hp)) return { type: 'into', el: head, parent: hp };
        return null;
      }
      if (!parent || (parent.id !== s.parentId && !A.canNest(s, parent))) return null;
    } else {
      zone = t.closest('#main .prio-group');
      if (!zone) return null;
    }
    const list = cards(zone).filter(x => x !== drag.el);
    let i = list.findIndex(x => { const r = x.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
    if (i < 0) i = list.length;
    return { type: 'place', zone, parent, list, i };
  }
  function showLine(tg) {
    const { zone, list, i } = tg, zr = zone.getBoundingClientRect();
    const prev = list[i - 1] && list[i - 1].getBoundingClientRect(), next = list[i] && list[i].getBoundingClientRect();
    if (!prev && !next) { line.remove(); zone.classList.add('org-into'); return; }
    const ref = next || prev;
    const y = prev && next ? (prev.bottom + next.top) / 2 : next ? next.top - 4 : prev.bottom + 4;
    if (line.parentElement !== zone) { clearMarks(); zone.classList.add('org-zone'); zone.appendChild(line); line.style.transition = 'none'; }
    else line.style.transition = '';
    line.style.width = ref.width + 'px';
    line.style.transform = `translate(${ref.left - zr.left}px,${y - zr.top - 1.5}px)`;
  }
  function findTarget(e) {
    if (!drag) return null;
    const t = e.target;
    if (drag.kind === 'task') {
      const row = t.closest('#main .task[data-tid]');
      if (row && row.dataset.tid !== drag.id) return { type: 'row', el: row, cls: 'org-before' };
      const head = t.closest('#main .subject[data-sid] > .s-head');
      if (head) return { type: 'subject', el: head, cls: 'org-into' };
      const sec = t.closest('#main details.sec[data-sec]');
      if (sec && SEC_DROP.includes(sec.dataset.sec)) return { type: 'sec', el: sec, cls: 'org-into' };
      return null;
    }
    return subjectTarget(e);
  }
  document.addEventListener('dragover', e => {
    const tg = findTarget(e);
    if (!tg) { if (drag && drag.kind === 'subject') clearMarks(); return; }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (tg.type === 'place') {
      const key = tg.list.map(x => x.dataset.sid).join() + '|' + tg.i;
      if (line._key !== key || line.parentElement !== tg.zone) { showLine(tg); line._key = key; }
      return;
    }
    const cls = tg.cls || 'org-into';
    if (!tg.el.classList.contains(cls)) { clearMarks(); tg.el.classList.add(cls); }
  });
  document.addEventListener('drop', e => {
    const tg = findTarget(e);
    if (!tg) return;
    e.preventDefault();
    clearMarks();
    const d = drag;
    drag = null;
    if (d.kind === 'task') dropTask(A.task(d.id), tg);
    else dropSubject(A.subj(d.id), tg);
  });
  const cmp = A.taskCmp;   // même ordre que le tableau de bord
  // Tâche posée sur un sujet, une section du tableau de bord ou une autre tâche (même échéance, nouvel ordre).
  // L'échéance passe par les règles des champs d'une tâche, comme la saisie ; Annuler passe par l'historique.
  function dropTask(t, tg) {
    if (!t) return;
    let msg;
    A.modifier(`Tâche déplacée : « ${A.titre(t)} »`, () => {
      if (tg.type === 'subject') {
        const s = A.subj(tg.el.closest('[data-sid]').dataset.sid);
        if (!s || s.id === t.subjectId) return false;
        A.setTaskField(t, 'subjectId', s.id);
        msg = `Rangée dans « ${s.title} »`;
      } else if (tg.type === 'sec') {
        const k = tg.el.dataset.sec;
        const nd = k === 'today' ? today() : k === 'tomorrow' ? addDays(today(), 1) : k === 'week' ? addDays(today(), 2) : null;
        if (k === 'week' && t.deadline > addDays(today(), 1) && t.deadline <= addDays(today(), 7)) return false;
        A.setTaskField(t, 'deadline', nd || '');
        msg = nd ? 'Échéance : ' + A.longDate(nd) : 'Échéance retirée';
      } else {
        const target = A.task(tg.el.dataset.tid);
        if (!target) return false;
        if (view() === 'sujets' && target.subjectId !== t.subjectId) {
          A.setTaskField(t, 'subjectId', target.subjectId || '');
          msg = `Rangée dans « ${A.subj(target.subjectId)?.title || 'Boîte de réception'} »`;
        }
        if (target.deadline !== t.deadline) {
          A.setTaskField(t, 'deadline', target.deadline || '');
          msg = (msg ? msg + ', ' : '') + (target.deadline ? 'échéance : ' + A.longDate(target.deadline) : 'sans échéance');
        }
        // Nouvel ordre parmi les tâches qui ont la même deadline
        const sib = db().tasks.filter(x => x !== t && !x.archived && isOpen(x) && x.deadline === t.deadline).sort(cmp);
        sib.splice(sib.indexOf(target), 0, t);
        sib.forEach((x, i) => { x.order = (i + 1) * 10; });
      }
    }, { toast: () => msg, annuler: () => !!msg });   // simple changement d'ordre : pas de bandeau, Ctrl+Z suffit
  }
  // Sujet ou sous-sujet posé à une place (trait d'insertion) ou sur l'en-tête d'un autre sujet
  function dropSubject(s, tg) {
    if (!s) return;
    const parent = tg.parent || null, moving = !!parent && parent.id !== s.parentId;
    let sibs, p;
    if (tg.type === 'into') {
      sibs = A.childrenOf(parent).filter(x => x !== s).sort((a, b) => a.priority - b.priority || (a.order || 0) - (b.order || 0));
      sibs.push(s);
      p = s.priority;
    } else {
      sibs = tg.list.map(x => A.subj(x.dataset.sid)).filter(Boolean);
      if (parent) {
        // Les sous-sujets restent triés par priorité : il prend celle de son voisin
        const nb = sibs[tg.i] || sibs[tg.i - 1];
        p = nb ? nb.priority : s.priority;
      } else p = +tg.zone.dataset.p || s.priority;
      const was = cards(tg.zone).map(x => x.dataset.sid).join();
      sibs.splice(tg.i, 0, s);
      if (!moving && p === s.priority && sibs.map(x => x.id).join() === was) return;
    }
    const msg = [moving ? `« ${A.titre(s)} » rangé dans « ${A.titre(parent)} »` : '',
      s.priority !== p ? `${moving ? 'passe' : `« ${A.titre(s)} » passe`} en P${p}` : ''].filter(Boolean).join(', ');
    A.modifier(`Sujet déplacé : « ${A.titre(s)} »`, () => {
      if (moving && !A.setParent(s, parent.id)) { A.toast('Ce sujet ne peut pas être rangé là (un seul niveau de sous-sujets)'); return false; }
      s.priority = p;
      sibs.forEach((x, i) => { x.order = (i + 1) * 10; });
    }, { toast: msg, annuler: !!msg });
  }

  /* ================= Tâches récurrentes ================= */
  const RECUR = [
    ['', 'Jamais'],
    ['workday:1', 'Chaque jour travaillé'],
    ['week:1', 'Chaque semaine'],
    ['week:2', 'Toutes les 2 semaines'],
    ['month:1', 'Chaque mois'],
    ['month:3', 'Chaque trimestre'],
    ['year:1', 'Chaque année']
  ];
  const recurKey = r => r ? `${r.freq}:${r.interval}` : '';
  const recurLabel = r => (RECUR.find(x => x[0] === recurKey(r)) || [, 'Répétée'])[1];

  // Échéance de l'occurrence suivante (règle du noyau, calendrier commun et réglage de décalage)
  const nextDate = t => A.prochaineEcheance(t, A.calendrier(), db().settings.decalage, today());

  // Module activable (Données › Modules actifs) : masqué, plus de ↻, plus d'option Répéter, plus de création automatique
  const recurOn = () => !A.modOn || A.modOn('recurrence');
  A.hooks.taskRow.push(t => t.recur && recurOn() ? `<span class="org-recur" title="Répète : ${esc(recurLabel(t.recur))}">↻</span>` : '');
  A.hooks.drawer.push(t => !recurOn() ? '' : `<div class="f"><label data-repere="recurrence">Répéter</label>
      <select data-org-recur data-k="dr-recur">${RECUR.map(([v, l]) => `<option value="${v}" ${v === recurKey(t.recur) ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <span class="hint">Quand elle est faite (ou annulée), la suivante est créée automatiquement${t.deadline ? '' : ', à partir de la date du jour'}.</span>
    </div>`);
  document.addEventListener('change', e => {
    if (!e.target.matches('[data-org-recur]')) return;
    const t = A.task(e.target.closest('[data-tid]').dataset.tid);
    if (!t) return;
    const v = e.target.value;
    A.modifier(() => `Récurrence : « ${A.titre(t)} »`, () => {
      t.recur = v ? { freq: v.split(':')[0], interval: +v.split(':')[1] } : null;
    }, { differe: true });
  });

  // Occurrence suivante d'une tâche récurrente faite (ou annulée), rangée si la tâche est rouverte.
  // Accroche du point unique de modification : seules les tâches que la modification a changées sont vues,
  // dans le même pas (Ctrl+Z sur « Fait » retire aussi l'occurrence). Sans photo d'avant : toutes les tâches.
  function checkRecurring(d, avant) {
    if (!recurOn()) return '';
    let vues = d.tasks;
    if (avant) {
      const prev = new Map((JSON.parse(avant).tasks || []).map(x => [x.id, JSON.stringify(x)]));
      vues = d.tasks.filter(x => prev.get(x.id) !== JSON.stringify(x));
    }
    const creees = [];
    for (const t of vues) {
      if (!t.recur || t.archived) continue;
      if (!isOpen(t) && !t.recurNextId) {
        const prochaine = nextDate(t), nd = prochaine.date;
        // Tâche complète (règles d'une nouvelle tâche) ; createdAt === updatedAt : l'occurrence est « non touchée »
        const now = A.nowIso();
        const n = A.normTask(Object.assign(JSON.parse(JSON.stringify(t)), {
          id: A.uid(), status: 'todo', progress: 0, deadline: nd,
          startDate: t.startDate && t.deadline ? addDays(nd, A.diffDays(t.startDate, t.deadline)) : null,
          createdAt: now, updatedAt: now, doneAt: null, archived: false, archivedAt: null,
          realMin: 0, timeLogs: [], timerStart: null, order: 0, recurNextId: null, recurFromId: t.id,
          decaleeDe: prochaine.decaleeDe,
          recur: Object.assign({}, t.recur, { jour: prochaine.jour })   // jour d'ancrage : le 31 revient le 31
        }));
        d.tasks.push(n);
        t.recurNextId = n.id;
        creees.push(n);
      } else if (isOpen(t) && t.recurNextId) {
        // La tâche a été rouverte : on range l'occurrence suivante si elle n'a pas été touchée
        const n = d.tasks.find(x => x.id === t.recurNextId);
        if (n && isOpen(n) && !n.archived && n.createdAt === n.updatedAt) {
          n.archived = true; n.archivedAt = A.nowIso();
        }
        t.recurNextId = null;
      }
    }
    // Texte ajouté au bandeau de la modification
    if (!creees.length) return '';
    if (creees.length > 1) return `↻ ${creees.length} prochaines occurrences créées` + (creees.some(n => n.decaleeDe) ? ' (dont des décalées hors des jours non travaillés)' : '');
    const n = creees[0];
    // « (le dimanche 1er n'est pas travaillé) » : le mois n'est répété que s'il change
    const memeMois = n.decaleeDe && n.decaleeDe.slice(0, 7) === n.deadline.slice(0, 7);
    const origine = n.decaleeDe && (memeMois ? A.longDate(n.decaleeDe).replace(/\s\S+$/, '') : A.longDate(n.decaleeDe));
    return n.decaleeDe
      ? `↻ Prochaine occurrence le ${A.longDate(n.deadline)} (le ${origine} n'est pas travaillé)`
      : '↻ Prochaine occurrence créée pour le ' + A.longDate(n.deadline);
  }
  A.hooks.apresModif.push(checkRecurring);
  // Tâches récurrentes faites sans occurrence : données arrivées d'ailleurs (ouverture, synchro, import) ou Récurrence rallumée
  const enAttente = () => recurOn() && db().tasks.some(t => t.recur && !t.archived && (!isOpen(t) ? !t.recurNextId : !!t.recurNextId));
  window.addEventListener('todo:modules', e => {
    if (e.detail.id === 'recurrence' && e.detail.on && enAttente()) A.modifier('Occurrences des tâches récurrentes', d => { checkRecurring(d); });
  });
  // À l'ouverture et après des données venues d'ailleurs (historique vidé), au prochain affichage, hors historique.
  // Pas après un Ctrl+Z : « Fait » annulé sans son occurrence doit le rester.
  let aRattraper = true;
  window.addEventListener('todo:historique-vide', () => { aRattraper = true; });
  window.addEventListener('todo:rendered', () => {
    if (!aRattraper) return;
    aRattraper = false;
    if (enAttente()) setTimeout(() => { if (enAttente()) A.modifier('Occurrences des tâches récurrentes', d => { checkRecurring(d); }, { historique: false }); aRattraper = false; }, 0);
  });

  /* ================= Aller au sujet depuis le tableau de bord ================= */
  css.textContent += `
.org-goto{font-size:14px}
`;
  A.hooks.taskRow.push(t => t.subjectId && view() !== 'sujets'
    ? `<button class="icon org-goto" data-org-goto title="Ouvrir dans l'onglet Sujets">↗</button>` : '');
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-org-goto]');
    if (!b) return;
    const t = A.task(b.closest('[data-tid]').dataset.tid);
    if (!t || !t.subjectId) return;
    A.allerA({ vue: 'sujets', tid: t.id }, { signalerFiltre: true });
  });

  // La page s'est déjà affichée avant le chargement de ce fichier : on la redessine avec les filtres et les poignées
  A.render();
})();
