/* Gestion de projet : projets, étapes (sujets rattachés), dépendances, jalons, Gantt et export PDF.
   Module séparé de index.html : il s'appuie sur window.todoApp, ses points d'accroche et sur projets-plan.js (calculs). */
(function () {
'use strict';
const A = window.todoApp, PL = window.projetsPlan;
if (!A || !A.hooks || !PL) { console.warn('projets.js : index.html ou projets-plan.js manquant.'); return; }
const { esc, uid, nowIso, today, toast } = A;
const db = () => A.getData();
// Module activable (Données › Modules actifs), désactivé par défaut
const on = () => !A.modOn || A.modOn('projet');
const view = () => location.hash.slice(1) || 'dashboard';
const coarse = () => !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);

const COLORS = ['#4f63e8', '#23915f', '#c77d0e', '#c2559b', '#0f8fa0', '#8e5bd8', '#d43a4a', '#5876b8'];

/* ---------- Données ---------- */
const allProjects = () => Array.isArray(db().projects) ? db().projects : (db().projects = []);
const projects = () => allProjects().filter(p => !p.archived).sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name, 'fr'));
const project = id => allProjects().find(p => p.id === id) || null;
const stepsOf = pid => db().subjects.filter(s => !s.archived && s.projectId === pid);
const workDays = () => Array.isArray(db().settings.workDays) ? db().settings.workDays : [1, 2, 3, 4, 5];
const milestonesOf = p => (p.milestones || []).filter(m => !m.archived);
const projectSchedule = p => PL.schedule(stepsOf(p.id), milestonesOf(p), workDays());

// Avancement du projet : moyenne des étapes pondérée par leur temps estimé (comme un sujet)
function projectProgress(p) {
  const steps = stepsOf(p.id);
  if (!steps.length) return 0;
  let w = 0, s = 0;
  steps.forEach(st => {
    const k = A.subjectStats(st), wt = Math.max(1, k.remainMin + 1);
    w += wt; s += wt * k.progress;
  });
  return Math.round(s / w);
}

/* ---------- Onglet ---------- */
if (!A.NAV.some(x => x[0] === 'projets')) {
  const i = A.NAV.findIndex(x => x[0] === 'sujets');
  A.NAV.splice(i + 1, 0, ['projets', 'Projets', 'gantt', 'projet']);
}

function listView() {
  const ps = projects();
  const cards = ps.map(p => {
    const sc = projectSchedule(p), prog = projectProgress(p);
    const next = milestonesOf(p).filter(m => m.date >= today()).sort((a, b) => a.date.localeCompare(b.date))[0];
    const nSteps = stepsOf(p.id).length;
    return `<div class="card pj-card" data-pid="${p.id}" style="--pj:${esc(p.color || COLORS[0])}">
      <button class="pj-open" data-pj="open-project" title="Ouvrir le planning">
        <span class="pj-name">${esc(p.name)}</span>
        ${sc.alerts.length ? `<span class="pj-badge late" title="Un jalon est dépassé">⚠ ${sc.alerts.length} alerte${sc.alerts.length > 1 ? 's' : ''}</span>` : ''}
      </button>
      <div class="pj-meta">
        ${p.owner ? `<span>${esc(p.owner)}</span>` : ''}
        <span>${nSteps} étape${nSteps > 1 ? 's' : ''}</span>
        ${next ? `<span title="Prochain jalon">◆ ${esc(next.name)} · ${A.longDate(next.date)}</span>` : ''}
      </div>
      <div class="pj-prog"><span class="bar" title="${prog}%"><i style="width:${prog}%"></i></span><span>${prog}%</span></div>
      <button class="icon pj-arch" data-pj="archive-project" title="Archiver le projet">${A.ICON.archive}</button>
    </div>`;
  }).join('');
  return `<h1>Projets</h1>
    <p class="sub">Les gros sujets organisés en étapes, reliées entre elles, avec leurs jalons.</p>
    <div class="toolbar"><button class="btn primary" data-pj="new-project">+ Nouveau projet</button></div>
    ${ps.length ? `<div class="pj-list">${cards}</div>` : `<div class="card"><p>Aucun projet pour le moment. Crée un projet, puis rattache-lui des sujets existants (champ « Projet » dans le sujet) ou ajoute des étapes.</p></div>`}`;
}

A.views.projets = () => {
  const p = db().ui.pjOpen && project(db().ui.pjOpen);
  return p && !p.archived ? detailView(p) : listView();
};

/* ---------- Détail d'un projet ---------- */
function alertsBanner(p, sc) {
  if (!sc.alerts.length) return '';
  const ms = new Map((p.milestones || []).map(m => [m.id, m]));
  const lines = sc.alerts.map(a => {
    const m = ms.get(a.milestoneId), st = A.subj(a.subjectId);
    return `<li><b>${esc(m.name)}</b> (${fmt(m.date)}) est dépassé par <button class="linkish" data-pj="open-step" data-sid="${a.subjectId}">${esc(st ? st.title : '?')}</button>, qui finit le ${fmt(sc.byId[a.subjectId].end)}</li>`;
  }).join('');
  return `<div class="pj-alert" role="alert"><span class="pj-alert-ic">⚠</span><div><b>Jalon dépassé</b> : décale le jalon ou réorganise les étapes, puis ré-exporte le PDF pour prévenir l'équipe.<ul>${lines}</ul></div></div>`;
}

function milestonesSection(p, sc) {
  const steps = stepsOf(p.id), late = new Set(sc.alerts.map(a => a.milestoneId));
  const rows = milestonesOf(p).sort((a, b) => (a.date || '').localeCompare(b.date || '')).map(m => `
    <div class="pj-ms ${late.has(m.id) ? 'late' : ''}" data-mid="${m.id}">
      <span class="pj-dia" aria-hidden="true">◆</span>
      <input class="inline" data-pjm="name" data-k="pjmn-${m.id}" value="${esc(m.name)}" aria-label="Nom du jalon">
      <input type="date" class="date" data-pjm="date" data-k="pjmd-${m.id}" value="${esc(m.date || '')}" aria-label="Date du jalon">
      ${late.has(m.id) ? '<span class="pj-badge late">dépassé</span>' : ''}
      <button class="icon" data-pj="archive-milestone" title="Archiver le jalon">${A.ICON.archive}</button>
      ${steps.length ? `<div class="pj-after"><span class="pj-lbl">À finir avant</span>${steps.map(o => `<label class="pj-chip"><input type="checkbox" data-pj-before="${o.id}" ${(m.before || []).includes(o.id) ? 'checked' : ''}><span>${esc(o.title)}</span></label>`).join('')}</div>` : ''}
    </div>`).join('');
  return `<section class="card pj-sec"><h3>Jalons</h3>
    <p class="pj-hint">Dates fixes du projet (livraison, paiements…). Ils ne bougent jamais seuls : une alerte prévient si une étape les dépasse.</p>
    ${rows}
    <div class="pj-ms-add">
      <input data-pjm="new-name" data-k="pjm-new-name" placeholder="+ Nouveau jalon (ex. Livraison machine)" aria-label="Nom du nouveau jalon">
      <input type="date" class="date" data-pjm="new-date" data-k="pjm-new-date" aria-label="Date du nouveau jalon">
      <button class="btn" data-pj="add-milestone">Ajouter</button>
    </div>
  </section>`;
}

function detailView(p) {
  const sc = projectSchedule(p), prog = projectProgress(p);
  return `<div class="pj-detail" data-pid="${p.id}" style="--pj:${esc(p.color || COLORS[0])}">
    <button class="btn pj-back" data-pj="back">← Projets</button>
    <h1>${esc(p.name)}</h1>
    <p class="sub">${p.owner ? esc(p.owner) + ' · ' : ''}${stepsOf(p.id).length} étape(s) · avancement ${prog}%</p>
    ${alertsBanner(p, sc)}
    <div class="toolbar"><button class="btn primary" data-pj="new-step">+ Nouvelle étape</button></div>
    ${ganttSection(p, sc)}
    ${milestonesSection(p, sc)}
  </div>`;
}

/* ---------- Gantt ---------- */
const T = ymd => Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10));
const dd = (a, b) => Math.round((T(b) - T(a)) / 864e5);
const shift = (ymd, n) => new Date(T(ymd) + n * 864e5).toISOString().slice(0, 10);
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const PPD = { week: 22, month: 5 };   // pixels par jour
const ROW = 40, HEAD = 34;

// Une couleur par responsable (ordre alphabétique), gris sans responsable ; le nom est toujours écrit à côté
function whoColors(steps) {
  const names = [...new Set(steps.map(s => (s.who || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
  return new Map(names.map((n, i) => [n, COLORS[i % COLORS.length]]));
}
const colorOf = (s, wc) => wc.get((s.who || '').trim()) || 'var(--p0)';

// Moteur de rendu : dessine une liste de lignes génériques (étapes, jalons ; tâches plus tard)
function renderGantt(p, sc, { scale = 'week', compact = false } = {}) {
  const steps = stepsOf(p.id), byStep = new Map(steps.map(s => [s.id, s]));
  const rows = PL.buildRows(steps, sc, milestonesOf(p));
  if (!rows.length) return '';
  const ms = new Map(milestonesOf(p).map(m => [m.id, m]));
  const lateMs = new Set(sc.alerts.map(a => a.milestoneId));
  const wc = whoColors(steps), td = today();
  const ppd = PPD[scale] || PPD.week;
  let lo = [td, ...rows.map(r => r.start)].sort()[0], hi = [td, ...rows.map(r => r.end)].sort().pop();
  lo = shift(lo, -3); hi = shift(hi, 10);
  if (scale === 'month') lo = lo.slice(0, 8) + '01';
  else lo = shift(lo, -((new Date(T(lo)).getUTCDay() + 6) % 7));          // lundi
  const RH = compact ? 46 : ROW;   // lignes plus hautes au doigt
  const days = dd(lo, hi) + 1, W = days * ppd, H = HEAD + rows.length * RH;
  const X = d => dd(lo, d) * ppd, Y = i => HEAD + i * RH + RH / 2;
  const ticks = [];
  for (let d = lo; d <= hi; d = shift(d, 1)) {
    const t = new Date(T(d));
    if (scale === 'month' ? t.getUTCDate() === 1 : t.getUTCDay() === 1)
      ticks.push(`<div class="pj-tick" style="left:${X(d)}px"><span>${scale === 'month' ? MONTHS[t.getUTCMonth()] + ' ' + t.getUTCFullYear() : t.getUTCDate() + ' ' + MONTHS[t.getUTCMonth()]}</span></div>`);
  }
  const idx = new Map(rows.map((r, i) => [r.kind + r.id, i]));
  const names = [], marks = [], arrows = [];
  rows.forEach((r, i) => {
    if (r.kind === 'jalon') {
      const m = ms.get(r.id), late = lateMs.has(r.id);
      names.push(`<div class="pj-g-name ms ${late ? 'late' : ''}" style="height:${RH}px"><span class="pj-dia">◆</span><span class="t">${esc(m.name)}</span></div>`);
      marks.push(`<div class="pj-g-ms ${late ? 'late' : ''}" data-mid="${m.id}" style="left:${X(r.start) + ppd / 2}px;top:${Y(i)}px" title="${esc(m.name)} · ${fmt(m.date)}${late ? ' · dépassé' : ''}"><i></i><span>${fmt(m.date)}</span></div>`);
      return;
    }
    const s = byStep.get(r.id), st = A.subjectStats(s), col = colorOf(s, wc);
    const late = r.end < td && st.status !== 'done' && st.status !== 'cancelled';
    const prev = (s.after || []).filter(id => sc.byId[id]);
    const label = `${esc(s.title)}${s.who ? ' · ' + esc(s.who) : ''} · ${fmt(r.start)} → ${fmt(r.end)} · ${st.progress}%${late ? ' · en retard' : ''}${prev.length ? ' · placée par ses dépendances' : ''}`;
    names.push(`<button class="pj-g-name" data-pj="open-step" data-sid="${s.id}" style="height:${RH}px" title="${label}"><span class="sw" style="background:${col}"></span><span class="t">${esc(s.title)}</span>${s.who ? `<span class="w">${esc(s.who)}</span>` : ''}</button>`);
    const w = (dd(r.start, r.end) + 1) * ppd;
    marks.push(`<button class="pj-bar ${late ? 'late' : ''} ${prev.length ? 'chained' : 'free'}" data-pj="open-step" data-sid="${s.id}" data-start="${r.start}" data-end="${r.end}"
      style="left:${X(r.start)}px;top:${Y(i) - 12}px;width:${w}px;--c:${col}" title="${label}" aria-label="${label}">
      <i class="pj-fill" style="width:${st.progress}%"></i>${w >= 44 ? `<span>${st.progress}%</span>` : ''}${compact || coarse() ? '' : '<b class="pj-grip" aria-hidden="true"></b>'}</button>`);
    prev.forEach(id => {
      const j = idx.get('etape' + id);
      if (j == null) return;
      // Fin du prédécesseur → début de l'étape, en coude dans l'intervalle entre les deux barres
      const x1 = X(sc.byId[id].end) + ppd, y1 = Y(j), x2 = X(r.start), y2 = Y(i), xm = x1 + Math.max(4, Math.min(10, (x2 - x1) / 2));
      arrows.push(`<path d="M${x1} ${y1}H${xm}V${y2}H${x2 - 1}" />`);
    });
  });
  const todayLine = td >= lo && td <= hi ? `<div class="pj-today" style="left:${X(td) + ppd / 2}px" title="Aujourd'hui"></div>` : '';
  return `<div class="pj-gantt ${compact ? 'compact' : ''}" data-scale="${scale}" data-lo="${lo}" data-ppd="${ppd}">
    <div class="pj-g-names"><div class="pj-g-head" style="height:${HEAD}px">Étape</div>${names.join('')}</div>
    <div class="pj-g-scroll"><div class="pj-g-track" style="width:${W}px;height:${H}px">
      <div class="pj-g-ticks" style="height:${H}px">${ticks.join('')}</div>
      ${rows.map((r, i) => `<div class="pj-g-row" style="top:${HEAD + i * RH}px;height:${RH}px"></div>`).join('')}
      ${todayLine}
      <svg class="pj-arrows" width="${W}" height="${H}" aria-hidden="true"><defs><marker id="pj-arr-${p.id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker></defs>
        ${arrows.join('').replace(/<path d/g, `<path marker-end="url(#pj-arr-${p.id})" d`)}</svg>
      ${marks.join('')}
    </div></div>
  </div>`;
}

function legend(steps) {
  const wc = whoColors(steps);
  if (!wc.size) return '';
  return `<div class="pj-legend"><span class="pj-lbl">Qui</span>${[...wc].map(([n, c]) => `<span class="pj-leg"><i style="background:${c}"></i>${esc(n)}</span>`).join('')}</div>`;
}

// Vue liste : la même information que le Gantt, ligne par ligne (téléphone, lecture rapide)
function listRows(p, sc) {
  const steps = stepsOf(p.id), late = new Set(sc.alerts.map(a => a.subjectId)), lateMs = new Set(sc.alerts.map(a => a.milestoneId)), td = today();
  const items = PL.buildRows(steps, sc, milestonesOf(p)).map(r => {
    if (r.kind === 'jalon') {
      const m = milestonesOf(p).find(x => x.id === r.id);
      return `<li class="pj-li ms ${lateMs.has(m.id) ? 'late' : ''}"><span class="pj-dia">◆</span><div><b>${esc(m.name)}</b><span class="d">${fmt(m.date)}${lateMs.has(m.id) ? ' · dépassé' : ''}</span></div></li>`;
    }
    const s = A.subj(r.id), k = A.subjectStats(s);
    const isLate = r.end < td && k.status !== 'done' && k.status !== 'cancelled';
    return `<li class="pj-li ${isLate || late.has(s.id) ? 'late' : ''}"><button class="linkish" data-pj="open-step" data-sid="${s.id}">${esc(s.title)}</button>
      <div class="d">${s.who ? esc(s.who) + ' · ' : ''}${fmt(r.start)} → ${fmt(r.end)}${isLate ? ' · en retard' : ''}${late.has(s.id) ? ' · dépasse un jalon' : ''}</div>
      <span class="pj-prog"><span class="bar"><i style="width:${k.progress}%"></i></span>${k.progress}%</span></li>`;
  });
  return items.length ? `<ul class="pj-mlist">${items.join('')}</ul>` : '';
}

function ganttSection(p, sc) {
  const ui = db().ui, scale = ui.pjScale === 'month' ? 'month' : 'week', list = ui.pjView === 'list';
  const compact = !!(window.matchMedia && matchMedia('(max-width: 760px)').matches);
  const un = sc.unplanned.map(id => A.subj(id)).filter(Boolean);
  const body = list ? listRows(p, sc) : renderGantt(p, sc, { scale, compact });
  const seg = (act, cur, opts, label) => `<div class="theme pj-seg" role="group" aria-label="${label}">${opts.map(([k, l]) => `<button class="${k === cur ? 'on' : ''}" data-pj="${act}" data-v="${k}" aria-pressed="${k === cur}">${l}</button>`).join('')}</div>`;
  return `<section class="card pj-sec pj-gsec">
    <div class="pj-gbar"><h3>Planning</h3>
      <div class="pj-gtools">
        ${seg('pview', list ? 'list' : 'gantt', [['gantt', 'Gantt'], ['list', 'Liste']], 'Affichage')}
        ${list ? '' : seg('scale', scale, [['week', 'Semaines'], ['month', 'Mois']], 'Échelle')}
      </div>
    </div>
    ${un.length ? `<div class="pj-unplanned"><span class="pj-lbl">À planifier</span>${un.map(s => `<button class="pj-chip" data-pj="open-step" data-sid="${s.id}">${esc(s.title)} · Planifier</button>`).join('')}</div>` : ''}
    ${body || '<p class="pj-hint">Aucune étape planifiée. Ouvre une étape et indique son début et sa durée.</p>'}
    ${list ? '' : legend(stepsOf(p.id))}
  </section>`;
}

/* ---------- Actions ---------- */
function newProject() {
  const name = (prompt('Nom du projet ?') || '').trim();
  if (!name) return;
  const ps = allProjects();
  ps.push({ id: uid(), name, owner: '', color: COLORS[ps.length % COLORS.length], order: ps.length,
    archived: false, archivedAt: null, createdAt: nowIso(), milestones: [] });
  A.save(); A.render();
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-pj]');
  if (!b || !on()) return;
  const pid = b.closest('[data-pid]')?.dataset.pid;
  const p = pid && project(pid);
  switch (b.dataset.pj) {
    case 'new-project': newProject(); break;
    case 'archive-project':
      if (!p || !confirm(`Archiver le projet « ${p.name} » ? Ses étapes restent des sujets.`)) return;
      p.archived = true; p.archivedAt = nowIso();
      if (db().ui.pjOpen === p.id) db().ui.pjOpen = null;
      A.save(); A.render(); toast('Projet archivé');
      break;
    case 'open-project':
      if (!p) return;
      db().ui.pjOpen = p.id; A.save(); A.render(); window.scrollTo(0, 0);
      break;
    case 'new-step': if (p) newStep(p); break;
    case 'add-milestone': {
      if (!p) return;
      const box = b.closest('.pj-ms-add');
      const name = box.querySelector('[data-pjm="new-name"]').value.trim(), date = box.querySelector('[data-pjm="new-date"]').value;
      if (!name || !date) { toast('Indique un nom et une date pour le jalon'); return; }
      (p.milestones = p.milestones || []).push({ id: uid(), name, date, before: [], archived: false });
      A.save(); A.render();
      break;
    }
    case 'archive-milestone': {
      const m = p && (p.milestones || []).find(x => x.id === b.closest('[data-mid]')?.dataset.mid);
      if (!m) return;
      m.archived = true; A.save(); A.render(); toast('Jalon archivé');
      break;
    }
    case 'open-step': openStep(b.dataset.sid); break;
    case 'scale': db().ui.pjScale = b.dataset.v; A.save(); A.render(); break;
    case 'pview': db().ui.pjView = b.dataset.v; A.save(); A.render(); break;
    case 'back':
      db().ui.pjOpen = null; A.save(); A.render();
      break;
  }
});

/* ---------- Étapes : un sujet rattaché à un projet ---------- */
const fmt = ymd => ymd ? new Date(ymd + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
const prevIds = (s, steps) => (s.after || []).filter(id => steps.some(x => x.id === id));
const whoValues = () => [...new Set(db().subjects.filter(s => !s.archived && s.projectId && s.who).map(s => s.who.trim()))].sort((a, b) => a.localeCompare(b, 'fr'));

A.hooks.subjectBody.push(s => {
  if (!on()) return '';
  const p = s.projectId && project(s.projectId);
  const opts = projects().concat(p && p.archived ? [p] : []);
  let html = `<div class="pj-step"><label class="pj-f">Projet <select data-pjf="project" data-k="pjp-${s.id}">
    <option value="">—</option>${opts.map(x => `<option value="${x.id}" ${x.id === s.projectId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>`;
  if (p) {
    const steps = stepsOf(p.id), others = steps.filter(x => x.id !== s.id);
    const sc = projectSchedule(p), c = sc.byId[s.id], hasPrev = prevIds(s, steps).length > 0;
    const plan = s.plan || {};
    html += hasPrev
      ? `<span class="pj-f pj-calc" title="Placée par les étapes dont elle dépend">Début calculé : <b>${c ? fmt(c.start) : 'à planifier'}</b></span>`
      : `<label class="pj-f">Début <input type="date" data-pjf="start" data-k="pjs-${s.id}" value="${esc(plan.start || '')}"></label>`;
    html += `<label class="pj-f">Durée <input type="number" min="1" step="1" inputmode="numeric" data-pjf="dur" data-k="pjd-${s.id}" value="${plan.durDays || ''}" placeholder="1"> j ouvrés</label>`;
    if (hasPrev) html += `<label class="pj-f">Décalage <input type="number" min="0" step="1" inputmode="numeric" data-pjf="lag" data-k="pjl-${s.id}" value="${s.lagDays || ''}" placeholder="0"> j</label>`;
    html += `<label class="pj-f">Qui <input data-pjf="who" data-k="pjw-${s.id}" value="${esc(s.who || '')}" list="pj-who-${s.id}" placeholder="Production, Entreprise A…"></label>
      <datalist id="pj-who-${s.id}">${whoValues().map(v => `<option value="${esc(v)}">`).join('')}</datalist>
      <span class="pj-f pj-end">${c ? `Fin prévue : <b>${fmt(c.end)}</b>` : 'À planifier : indique un début et une durée'}</span>`;
    if (others.length) html += `<div class="pj-after"><span class="pj-lbl">Commence après</span>${others.map(o => `<label class="pj-chip"><input type="checkbox" data-pj-after="${o.id}" ${(s.after || []).includes(o.id) ? 'checked' : ''}><span>${esc(o.title)}</span></label>`).join('')}</div>`;
  }
  return html + '</div>';
});

function detachStep(s) {
  const pid = s.projectId, p = project(pid);
  db().subjects.forEach(x => { if (x.projectId === pid && Array.isArray(x.after)) x.after = x.after.filter(id => id !== s.id); });
  if (p) (p.milestones || []).forEach(m => { if (Array.isArray(m.before)) m.before = m.before.filter(id => id !== s.id); });
  s.projectId = null; s.after = []; s.lagDays = 0;
}

// Jalons : nom, date, étapes à finir avant
document.addEventListener('change', e => {
  const el = e.target.closest('[data-mid] [data-pjm], [data-mid] [data-pj-before]');
  if (!el || !on()) return;
  const p = project(el.closest('[data-pid]')?.dataset.pid);
  const m = p && (p.milestones || []).find(x => x.id === el.closest('[data-mid]').dataset.mid);
  if (!m) return;
  if (el.dataset.pjBefore) {
    m.before = (m.before || []).filter(x => x !== el.dataset.pjBefore);
    if (el.checked) m.before.push(el.dataset.pjBefore);
  } else if (el.dataset.pjm === 'name') { if (el.value.trim()) m.name = el.value.trim(); }
  else if (el.dataset.pjm === 'date') { if (el.value) m.date = el.value; }
  A.save(); A.render();
});

document.addEventListener('change', e => {
  const el = e.target.closest('[data-pjf], [data-pj-after]');
  if (!el || !on()) return;
  const s = A.subj(el.closest('[data-sid]')?.dataset.sid);
  if (!s) return;
  const v = el.value;
  if (el.dataset.pjAfter) {
    const id = el.dataset.pjAfter;
    s.after = (s.after || []).filter(x => x !== id);
    if (el.checked) {
      if (PL.wouldCycle(stepsOf(s.projectId), id, s.id)) { el.checked = false; toast('Ce lien créerait une boucle entre étapes'); return; }
      s.after.push(id);
    }
  } else switch (el.dataset.pjf) {
    case 'project':
      if (s.projectId && s.projectId !== v) detachStep(s);
      s.projectId = v || null;
      if (v && !s.plan) s.plan = {};
      break;
    case 'start': s.plan = Object.assign({}, s.plan, { start: v || null }); break;
    case 'dur': s.plan = Object.assign({}, s.plan, { durDays: v ? Math.max(1, Math.round(+v) || 1) : null }); break;
    case 'lag': s.lagDays = Math.max(0, Math.round(+v) || 0); break;
    case 'who': s.who = v.trim(); break;
    default: return;
  }
  s.updatedAt = nowIso();
  A.save(); A.render();
});

// Nouvelle étape depuis un projet : un sujet rattaché, ouvert dans l'onglet Sujets
let goTo = null;
function newStep(p) {
  const title = (prompt('Nom de la nouvelle étape ?') || '').trim();
  if (!title) return;
  const s = { id: uid(), title, priority: 3, description: '', code: '', secteur: '', produit: '', archived: false, archivedAt: null,
    createdAt: nowIso(), updatedAt: nowIso(), source: null, projectId: p.id, plan: {}, after: [], lagDays: 0, who: '' };
  db().subjects.push(s);
  if (!db().ui.expanded.includes(s.id)) db().ui.expanded.push(s.id);
  A.save();
  openStep(s.id);
}
function openStep(sid) {
  if (!db().ui.expanded.includes(sid)) { db().ui.expanded.push(sid); A.save(); }
  goTo = sid;
  if (view() === 'sujets') A.render(); else location.hash = 'sujets';
}
window.addEventListener('todo:rendered', () => {
  if (!goTo || view() !== 'sujets') return;
  const sid = goTo; goTo = null;
  setTimeout(() => {
    const box = document.querySelector(`#main .subject[data-sid="${sid}"]`);
    if (!box) { toast('Cette étape est masquée par un filtre'); return; }
    box.scrollIntoView({ block: 'start', behavior: 'smooth' });
    box.classList.add('org-flash');
  }, 30);
});

/* ---------- Édition directe : glisser une étape libre, étirer sa fin (souris, pas sur écran tactile) ---------- */
let drag = null, swallowClick = false;
function workdaysBetween(a, b) {   // nombre de jours ouvrés de a à b inclus
  const wd = workDays();
  let n = 0;
  for (let d = a; d <= b; d = shift(d, 1)) if (wd.includes(new Date(T(d)).getUTCDay())) n++;
  return n;
}
document.addEventListener('pointerdown', e => {
  const bar = e.target.closest('.pj-bar');
  if (!bar || e.button !== 0 || coarse() || !on()) return;
  const resize = !!e.target.closest('.pj-grip');
  if (!resize && !bar.classList.contains('free')) return;
  const g = bar.closest('.pj-gantt');
  drag = { bar, resize, x0: e.clientX, ppd: +g.dataset.ppd, left: bar.offsetLeft, width: bar.offsetWidth, days: 0, moved: false };
  bar.setPointerCapture && bar.setPointerCapture(e.pointerId);
});
document.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x0;
  if (Math.abs(dx) > 4) drag.moved = true;
  if (!drag.moved) return;
  drag.days = Math.round(dx / drag.ppd);
  if (drag.resize) drag.bar.style.width = Math.max(drag.ppd, drag.width + drag.days * drag.ppd) + 'px';
  else drag.bar.style.left = drag.left + drag.days * drag.ppd + 'px';
  drag.bar.classList.add('dragging');
});
document.addEventListener('pointerup', () => {
  if (!drag) return;
  const { bar, resize, days, moved } = drag;
  drag = null;
  if (!moved) return;
  swallowClick = true; setTimeout(() => { swallowClick = false; }, 0);
  const s = A.subj(bar.dataset.sid);
  if (!s || !days) { A.render(); return; }
  const start = bar.dataset.start, end = bar.dataset.end;
  if (resize) {
    const newEnd = shift(end, days);
    s.plan = Object.assign({}, s.plan, { durDays: Math.max(1, newEnd < start ? 1 : workdaysBetween(start, newEnd)) });
  } else s.plan = Object.assign({}, s.plan, { start: PL.nextWorkday(shift(start, days), workDays()) });
  s.updatedAt = nowIso();
  A.save(); A.render();
});
// Un glisser ne doit pas ouvrir l'étape
document.addEventListener('click', e => { if (swallowClick && e.target.closest('.pj-gantt')) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);

// À l'ouverture, la frise se place sur aujourd'hui (un tiers de la largeur avant)
window.addEventListener('todo:rendered', () => {
  if (view() !== 'projets') return;
  document.querySelectorAll('#main .pj-gantt').forEach(g => {
    const sc = g.querySelector('.pj-g-scroll'), t = g.querySelector('.pj-today');
    if (sc && t && !sc.dataset.placed) { sc.scrollLeft = Math.max(0, t.offsetLeft - sc.clientWidth / 3); sc.dataset.placed = '1'; }
  });
});

// Accès pour les étapes suivantes du module (même fichier)
Object.assign(A, { pj: { on, project, projects, stepsOf, projectSchedule } });
A.render();
})();
