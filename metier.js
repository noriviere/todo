/* Règles métier de l'appli : données, état d'un sujet, temps restant…
   Fonctions pures : elles reçoivent les données et le jour en paramètres, sans accès à la page ni au stockage.
   Chargé par index.html avant le script principal et testé sous Node (tests/metier.test.js). */
(function (root) {
'use strict';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const nowIso = () => new Date().toISOString();

/* ---------- Données ---------- */
function blank() {
  return {
    version: 1,
    subjects: [],
    tasks: [],
    settings: { theme: 'auto', workdayMin: 420, lastExport: null, modules: {} },
    ui: { expanded: [], showClosed: false, search: '', dims: { code: '', secteur: '', produit: '' } }
  };
}
function normSubject(s) {
  return Object.assign({
    id: uid(), title: '', priority: 3, description: '', code: '', secteur: '', produit: '', archived: false, archivedAt: null,
    createdAt: nowIso(), updatedAt: nowIso(), source: null, parentId: null
  }, s);
}
function normTask(t) {
  return Object.assign({
    id: uid(), subjectId: null, title: '', notes: '',
    deadline: null, startDate: null,
    estimateMin: null,
    status: 'todo', progress: 0,
    archived: false, archivedAt: null,
    createdAt: nowIso(), updatedAt: nowIso(), doneAt: null,
    // Temps réel : chrono et saisie à la main
    realMin: 0, timeLogs: [], timerStart: null,
    // Placement dans la Charge : 'deadline' = tout le jour J, 'spread' = réparti de startDate à deadline, 'daily' = dailyMin par jour
    plan: { mode: 'deadline', dailyMin: null },
    source: null
  }, t);
}

/* ---------- Tâches ---------- */
const isOpen = t => t.status === 'todo' || t.status === 'doing' || t.status === 'waiting';

// Temps restant (voir CONTEXT.md) : estimé × part restante si en cours avec un %, sinon estimé − réel ; jamais négatif
function remaining(t) {
  const est = t.estimateMin || 0;
  if (!est) return 0;
  if (t.status === 'doing' && t.progress > 0) return Math.round(est * (1 - t.progress / 100));
  return Math.max(0, est - (t.realMin || 0));
}

/* ---------- Sujets et sous-sujets ---------- */
const subjOf = (d, id) => id ? d.subjects.find(s => s.id === id) || null : null;
// Sous-sujets : un seul niveau. Un parent introuvable ou lui-même rangé ailleurs ne compte pas (le sujet reste au premier niveau).
function parentOf(s, d) {
  const p = s && s.parentId && s.parentId !== s.id ? subjOf(d, s.parentId) : null;
  return p && !p.parentId ? p : null;
}
// Sous-sujets d'un sujet ; all = archivés compris
const childrenOf = (s, d, all) => d.subjects.filter(x => x.parentId === s.id && x !== s && (all || !x.archived) && parentOf(x, d) === s);

// État d'un sujet déduit de ses tâches (hors archivées) ; un parent compte aussi les tâches de ses sous-sujets actifs
function subjectStats(s, d, today) {
  const ids = new Set([s.id, ...childrenOf(s, d).map(c => c.id)]);
  const ts = d.tasks.filter(t => ids.has(t.subjectId) && !t.archived);
  const live = ts.filter(t => t.status !== 'cancelled');
  const open = ts.filter(isOpen);
  const done = live.filter(t => t.status === 'done').length;
  let status, progress = 0, estMin = 0;
  if (!ts.length) status = 'empty';
  else if (!live.length) status = 'cancelled';
  else {
    let w = 0, p = 0;
    for (const t of live) {
      const wt = t.estimateMin || 60;
      w += wt;
      p += wt * (t.status === 'done' ? 100 : t.status === 'doing' ? (t.progress || 0) : 0);
    }
    progress = Math.round(p / w);
    estMin = w;
    if (done === live.length) status = 'done';
    else if (done > 0 || live.some(t => t.status === 'doing')) status = 'doing';
    else if (open.length && open.every(t => t.status === 'waiting')) status = 'waiting';
    else status = 'todo';
  }
  const late = open.filter(t => t.deadline && t.deadline < today).length;
  const next = open.map(t => t.deadline).filter(Boolean).sort()[0] || null;
  const remainMin = open.reduce((a, t) => a + remaining(t), 0);
  return { total: ts.length, live: live.length, open: open.length, done, status, progress, late, next, remainMin, estMin, children: ids.size - 1 };
}

const api = { uid, nowIso, blank, normSubject, normTask, isOpen, remaining, parentOf, childrenOf, subjectStats };
if (typeof module === 'object' && module.exports) module.exports = api;
else root.todoMetier = api;
})(typeof window !== 'undefined' ? window : this);
