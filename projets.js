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
function detailView(p) {
  return `<div class="pj-detail" data-pid="${p.id}">
    <button class="btn pj-back" data-pj="back">← Projets</button>
    <h1>${esc(p.name)}</h1>
    <div class="toolbar"><button class="btn primary" data-pj="new-step">+ Nouvelle étape</button></div>
  </div>`;
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
    case 'open-step': openStep(b.dataset.sid); break;
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

// Accès pour les étapes suivantes du module (même fichier)
Object.assign(A, { pj: { on, project, projects, stepsOf, projectSchedule } });
A.render();
})();
