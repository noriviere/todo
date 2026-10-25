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
.subject.org-before{box-shadow:0 -3px 0 var(--accent),var(--shadow)}
.org-into{outline:2px dashed var(--accent);outline-offset:-2px;border-radius:8px}
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
    return `<div class="org-filters">
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
      A.save(); A.render(); return;
    }
    if (e.target.closest('[data-org-clear]')) {
      db().ui.dashFilter = { prios: [], subjectId: '', q: '' };
      A.save(); A.render(); return;
    }
    if (e.target.closest('[data-org-autoorder]')) {
      db().subjects.forEach(s => { s.order = 0; });
      A.save(); A.render(); A.toast('Sujets reclassés par urgence'); return;
    }
  });
  document.addEventListener('input', e => {
    if (e.target.matches('[data-org-q]')) { F().q = e.target.value; A.save(); A.scheduleRender(); }
  });
  document.addEventListener('change', e => {
    if (e.target.matches('[data-org-subj]')) { F().subjectId = e.target.value; A.save(); A.render(); }
  });

  // Bouton pour revenir au tri automatique des sujets après un glisser-déposer
  A.hooks.subjectsToolbar.push(() =>
    db().subjects.some(s => !s.archived && s.order)
      ? '<button class="btn" data-org-autoorder title="Oublier l\'ordre manuel et reclasser par urgence">Ordre auto</button>' : '');

  /* ================= Glisser-déposer ================= */
  // Tâche → autre tâche : se place juste avant (prend sa deadline, et son sujet sur la page Sujets)
  // Tâche → en-tête d'un sujet : rangée dans ce sujet
  // Tâche → section Aujourd'hui / Demain / 7 prochains jours / Sans deadline : nouvelle deadline
  // Sujet → autre sujet : se place avant (prend sa priorité) ; Sujet → groupe P1/P2/P3 : change de priorité
  let drag = null;

  function addGrips() {
    if (view() === 'archives') return;
    const main = document.getElementById('main');
    main.querySelectorAll('.task[data-tid]').forEach(r => {
      if (!r.querySelector(':scope > .org-grip')) r.insertAdjacentHTML('afterbegin', '<span class="org-grip" title="Glisser pour déplacer">⋮⋮</span>');
    });
    main.querySelectorAll('.subject[data-sid] > .s-head').forEach(h => {
      if (!h.querySelector(':scope > .org-grip')) h.insertAdjacentHTML('afterbegin', '<span class="org-grip" title="Glisser pour déplacer">⋮⋮</span>');
    });
  }
  window.addEventListener('todo:rendered', addGrips);

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
    else if (el.matches('.subject[data-sid]')) drag = { kind: 'subject', id: el.dataset.sid, el };
    else return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', drag.id);
    setTimeout(() => el.classList.add('org-dragging'), 0);
  });
  function clearMarks() {
    document.querySelectorAll('.org-before,.org-into').forEach(x => x.classList.remove('org-before', 'org-into'));
  }
  document.addEventListener('dragend', () => {
    if (drag) { drag.el.classList.remove('org-dragging'); drag.el.draggable = false; }
    drag = null; clearMarks();
  });

  const SEC_DROP = ['today', 'tomorrow', 'week', 'nodate'];
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
    } else {
      const s = t.closest('#main .subject[data-sid]');
      if (s && s.dataset.sid !== drag.id) return { type: 'subject', el: s, cls: 'org-before' };
      const g = t.closest('#main .prio-group');
      if (g) return { type: 'group', el: g, cls: 'org-into' };
    }
    return null;
  }
  document.addEventListener('dragover', e => {
    const tg = findTarget(e);
    if (!tg) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!tg.el.classList.contains(tg.cls)) { clearMarks(); tg.el.classList.add(tg.cls); }
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

  function cmp(a, b) {
    const pa = A.subj(a.subjectId)?.priority ?? 4, pb = A.subj(b.subjectId)?.priority ?? 4;
    return (a.deadline || '9999').localeCompare(b.deadline || '9999')
      || (a.order || 0) - (b.order || 0) || pa - pb
      || (b.status === 'doing') - (a.status === 'doing') || a.createdAt.localeCompare(b.createdAt);
  }
  function snapshot(t) { return { deadline: t.deadline, subjectId: t.subjectId, order: t.order }; }
  function dropTask(t, tg) {
    if (!t) return;
    const before = snapshot(t);
    const undo = () => { Object.assign(t, before); A.save(); A.render(); };
    let msg;
    if (tg.type === 'subject') {
      const s = A.subj(tg.el.closest('[data-sid]').dataset.sid);
      if (!s || s.id === t.subjectId) return;
      t.subjectId = s.id;
      msg = `Rangée dans « ${s.title} »`;
    } else if (tg.type === 'sec') {
      const k = tg.el.dataset.sec;
      const nd = k === 'today' ? today() : k === 'tomorrow' ? addDays(today(), 1) : k === 'week' ? addDays(today(), 2) : null;
      if (k === 'week' && t.deadline > addDays(today(), 1) && t.deadline <= addDays(today(), 7)) return;
      t.deadline = nd;
      msg = nd ? 'Deadline : ' + A.longDate(nd) : 'Deadline retirée';
    } else {
      const target = A.task(tg.el.dataset.tid);
      if (!target) return;
      if (view() === 'sujets' && target.subjectId !== t.subjectId) {
        t.subjectId = target.subjectId;
        msg = `Rangée dans « ${A.subj(target.subjectId)?.title || 'Boîte de réception'} »`;
      }
      if (target.deadline !== t.deadline) {
        t.deadline = target.deadline;
        msg = (msg ? msg + ', ' : '') + (target.deadline ? 'deadline : ' + A.longDate(target.deadline) : 'sans deadline');
      }
      // Nouvel ordre parmi les tâches qui ont la même deadline
      const sib = db().tasks.filter(x => x !== t && !x.archived && isOpen(x) && x.deadline === t.deadline).sort(cmp);
      sib.splice(sib.indexOf(target), 0, t);
      sib.forEach((x, i) => { x.order = (i + 1) * 10; });
    }
    t.updatedAt = A.nowIso();
    A.save(); A.render();
    if (msg) A.toast(msg, undo);
  }
  function dropSubject(s, tg) {
    if (!s) return;
    const prev = s.priority;
    let p;
    if (tg.type === 'group') {
      p = +tg.el.querySelector('.prio-title').textContent.trim().match(/^P(\d)/)[1];
      if (p === s.priority) return;
    } else {
      p = A.subj(tg.el.dataset.sid).priority;
    }
    s.priority = p;
    // Ordre tel qu'affiché, avec le sujet déplacé inséré au bon endroit
    const shown = [...document.querySelectorAll('#main .subject[data-sid]')].map(x => A.subj(x.dataset.sid))
      .filter(x => x && x !== s && x.priority === p);
    const idx = tg.type === 'group' ? shown.length : shown.indexOf(A.subj(tg.el.dataset.sid));
    shown.splice(idx < 0 ? shown.length : idx, 0, s);
    shown.forEach((x, i) => { x.order = (i + 1) * 10; });
    s.updatedAt = A.nowIso();
    A.save(); A.render();
    if (prev !== p) A.toast(`« ${s.title} » passe en P${p}`, () => { s.priority = prev; A.save(); A.render(); });
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

  function addMonths(ds, n) {
    const d = parseYmd(ds), day = d.getDate();
    d.setDate(1); d.setMonth(d.getMonth() + n);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
    return ymd(d);
  }
  function step(ds, r) {
    if (r.freq === 'workday') {
      const wd = Array.isArray(db().settings.workDays) && db().settings.workDays.length ? db().settings.workDays : [1, 2, 3, 4, 5];
      let n = ds;
      for (let i = 0; i < 14; i++) { n = addDays(n, 1); if (wd.includes(parseYmd(n).getDay())) break; }
      return n;
    }
    if (r.freq === 'week') return addDays(ds, 7 * r.interval);
    if (r.freq === 'month') return addMonths(ds, r.interval);
    return addMonths(ds, 12 * r.interval);
  }
  function nextDate(t) {
    let n = step(t.deadline || today(), t.recur);
    // Si la tâche a été faite en retard, on saute jusqu'à la prochaine échéance à venir
    for (let i = 0; i < 1000 && n < today(); i++) n = step(n, t.recur);
    return n;
  }

  // Module activable (Données › Modules actifs) : masqué, plus de ↻, plus d'option Répéter, plus de création automatique
  const recurOn = () => !A.modOn || A.modOn('recurrence');
  A.hooks.taskRow.push(t => t.recur && recurOn() ? `<span class="org-recur" title="Répète : ${esc(recurLabel(t.recur))}">↻</span>` : '');
  A.hooks.drawer.push(t => !recurOn() ? '' : `<div class="f"><label>Répéter</label>
      <select data-org-recur data-k="dr-recur">${RECUR.map(([v, l]) => `<option value="${v}" ${v === recurKey(t.recur) ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <span class="hint">Quand elle est faite (ou annulée), la suivante est créée automatiquement${t.deadline ? '' : ', à partir de la date du jour'}.</span>
    </div>`);
  document.addEventListener('change', e => {
    if (!e.target.matches('[data-org-recur]')) return;
    const t = A.task(e.target.closest('[data-tid]').dataset.tid);
    if (!t) return;
    const v = e.target.value;
    t.recur = v ? { freq: v.split(':')[0], interval: +v.split(':')[1] } : null;
    t.updatedAt = A.nowIso();
    A.save(); A.scheduleRender();
  });

  let busy = false;
  function checkRecurring() {
    if (busy || !recurOn()) return;
    busy = true;
    try {
      let changed = false, created = null;
      const tasks = db().tasks;
      for (const t of [...tasks]) {
        if (!t.recur || t.archived) continue;
        if (!isOpen(t) && !t.recurNextId) {
          const nd = nextDate(t);
          const n = JSON.parse(JSON.stringify(t));
          const now = A.nowIso();
          Object.assign(n, {
            id: A.uid(), status: 'todo', progress: 0, deadline: nd,
            startDate: t.startDate && t.deadline ? addDays(nd, A.diffDays(t.startDate, t.deadline)) : null,
            createdAt: now, updatedAt: now, doneAt: null, archived: false, archivedAt: null,
            realMin: 0, timeLogs: [], timerStart: null, order: 0, recurNextId: null, recurFromId: t.id
          });
          tasks.push(n);
          t.recurNextId = n.id;
          changed = true; created = n;
        } else if (isOpen(t) && t.recurNextId) {
          // La tâche a été rouverte : on range l'occurrence suivante si elle n'a pas été touchée
          const n = A.task(t.recurNextId);
          if (n && isOpen(n) && !n.archived && n.createdAt === n.updatedAt) {
            n.archived = true; n.archivedAt = A.nowIso();
          }
          t.recurNextId = null;
          changed = true;
        }
      }
      if (changed) {
        A.save(); A.scheduleRender();
        if (created) setTimeout(() => A.toast('↻ Prochaine occurrence créée pour le ' + A.longDate(created.deadline)), 10);
      }
    } finally { busy = false; }
  }
  window.addEventListener('todo:saved', checkRecurring);

  /* ================= Aller au sujet depuis le tableau de bord ================= */
  css.textContent += `
.org-goto{font-size:14px}
@keyframes orgFlash{0%,60%{background:var(--accent-bg)}100%{background:transparent}}
.org-flash{animation:orgFlash 2.2s ease-out}
`;
  let goTo = null;
  A.hooks.taskRow.push(t => t.subjectId && view() !== 'sujets'
    ? `<button class="icon org-goto" data-org-goto title="Ouvrir dans l'onglet Sujets">↗</button>` : '');
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-org-goto]');
    if (!b) return;
    const t = A.task(b.closest('[data-tid]').dataset.tid);
    if (!t || !t.subjectId) return;
    const ui = db().ui;
    A.expandTo(t.subjectId);
    A.save();
    goTo = { sid: t.subjectId, tid: t.id };
    location.hash = 'sujets';
  });
  window.addEventListener('todo:rendered', () => {
    if (!goTo || view() !== 'sujets') return;
    const g = goTo;
    goTo = null;
    // Après le retour en haut de page fait par le changement d'onglet
    setTimeout(() => {
      const box = document.querySelector(`#main .subject[data-sid="${g.sid}"]`);
      if (!box) { A.toast('Ce sujet est masqué par un filtre'); return; }
      const row = box.querySelector(`.task[data-tid="${g.tid}"]`) || box;
      row.scrollIntoView({ block: 'center', behavior: 'smooth' });
      row.classList.add('org-flash');
      box.classList.add('org-flash');
    }, 30);
  });

  // La page s'est déjà affichée avant le chargement de ce fichier : on la redessine avec les filtres et les poignées
  A.render();
})();
