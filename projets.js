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
    case 'back':
      db().ui.pjOpen = null; A.save(); A.render();
      break;
  }
});

// Accès pour les étapes suivantes du module (même fichier)
Object.assign(A, { pj: { on, project, projects, stepsOf, projectSchedule } });
A.render();
})();
