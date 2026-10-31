/* Règles métier de l'appli : données, état d'un sujet, temps restant…
   Fonctions pures : elles reçoivent les données et le jour en paramètres, sans accès à la page ni au stockage.
   Chargé par index.html avant le script principal et testé sous Node (tests/metier.test.js). */
(function (root) {
'use strict';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const nowIso = () => new Date().toISOString();

/* ---------- Dates et durées ---------- */
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

// Durées en minutes : "1h30", "1.5h", "45min", "45m", "2" (= heures), "1j" (= workdayMin) ; vide = null, illisible = NaN
function parseDur(s, workdayMin = 420) {
  s = String(s ?? '').trim().toLowerCase().replace(',', '.').replace(/\s+/g, '');
  if (!s) return null;
  let m;
  if ((m = s.match(/^(\d+(?:\.\d+)?)h(\d{1,2})?(?:m|min|mn)?$/))) return Math.round(parseFloat(m[1]) * 60 + (m[2] ? +m[2] : 0));
  if ((m = s.match(/^(\d+)(?:m|min|mn)$/))) return +m[1];
  if ((m = s.match(/^(\d+(?:\.\d+)?)j$/))) return Math.round(parseFloat(m[1]) * workdayMin);
  if ((m = s.match(/^\d+(?:\.\d+)?$/))) return Math.round(parseFloat(s) * 60);
  return NaN;
}

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

function migrate(d) {
  const b = blank();
  d = Object.assign(b, d);
  d.settings = Object.assign(blank().settings, d.settings);
  if (!d.settings.modules || typeof d.settings.modules !== 'object') d.settings.modules = {};
  d.ui = Object.assign(blank().ui, d.ui);
  // Ancienne dimension « Projet » (Excel) renommée « Code » : « Projet » désigne désormais le module Projets
  const dims = d.ui.dims || {};
  if (dims.projet != null) { if (!dims.code) dims.code = dims.projet; delete dims.projet; }
  d.ui.dims = Object.assign({ code: '', secteur: '', produit: '' }, dims);
  d.subjects = (d.subjects || []).map(s => {
    if (s && s.projet != null) { if (!s.code) s.code = s.projet; delete s.projet; }
    return normSubject(s);
  });
  d.tasks = (d.tasks || []).map(normTask);
  migrateProjects(d);
  return d;
}
// Anciens projets séparés (db.projects) : chaque projet devient un sujet en mode projet, ses étapes ses sous-sujets
function migrateProjects(d) {
  const ps = Array.isArray(d.projects) ? d.projects : [];
  for (const p of ps) {
    if (!p || !p.id) continue;
    const steps = d.subjects.filter(s => s.projectId === p.id);
    const pj = { owner: p.owner || '', color: p.color || '', milestones: Array.isArray(p.milestones) ? p.milestones : [] };
    let s = d.subjects.find(x => x.id === p.id);
    if (!s) {
      const common = k => { const v = [...new Set(steps.map(x => (x[k] || '').trim()))]; return v.length === 1 ? v[0] : ''; };
      s = normSubject({ id: p.id, title: p.name || 'Projet', priority: steps.length ? Math.min(...steps.map(x => +x.priority || 3)) : 2,
        code: common('code'), secteur: common('secteur'), produit: common('produit'),
        archived: !!p.archived, archivedAt: p.archivedAt || null, createdAt: p.createdAt || nowIso() });
      d.subjects.push(s);
    }
    s.isProject = true; s.pj = pj; s.parentId = null;
    steps.forEach(x => {
      // Un seul niveau : une étape qui a ses propres sous-sujets reste au premier niveau
      if (x === s || d.subjects.some(y => y.parentId === x.id && y !== x)) return;
      const old = x.parentId && x.parentId !== p.id ? d.subjects.find(y => y.id === x.parentId) : null;
      if (old) {   // rangée ailleurs entre-temps (autre appareil) : ses liens d'étape ne valent plus
        x.after = []; x.lagDays = 0;
        ((old.pj && old.pj.milestones) || []).forEach(m => { if (Array.isArray(m.before)) m.before = m.before.filter(id => id !== x.id); });
      }
      x.parentId = p.id;
    });
  }
  d.subjects.forEach(s => { delete s.projectId; });
  delete d.projects;
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

// Tranche d'échéance d'une tâche pour le jour donné
function bucket(t, td) {
  if (!t.deadline) return 'nodate';
  const d = t.deadline;
  if (d < td) return 'late';
  if (d === td) return 'today';
  if (d === addDays(td, 1)) return 'tomorrow';
  if (d <= addDays(td, 7)) return 'week';
  return 'later';
}
// Ordre des tâches (tableau de bord, glisser-déposer) : échéance, ordre manuel, priorité du sujet, en cours d'abord, création
const taskCmp = d => (a, b) => {
  const pa = subjOf(d, a.subjectId)?.priority ?? 4, pb = subjOf(d, b.subjectId)?.priority ?? 4;
  return (a.deadline || '9999').localeCompare(b.deadline || '9999')
    || (a.order || 0) - (b.order || 0)
    || pa - pb
    || (b.status === 'doing') - (a.status === 'doing')
    || a.createdAt.localeCompare(b.createdAt);
};

const DUR_ERR = 'Durée non comprise. Exemples : 1h30, 45min, 2 (heures)';
// Modifie un champ d'une tâche : true si changé, false si champ inconnu, ou le texte de l'erreur (rien n'est modifié)
function setTaskField(t, f, v, d) {
  const wd = d && d.settings && d.settings.workdayMin || 420;
  switch (f) {
    case 'title': t.title = v.trim(); break;
    case 'notes': t.notes = v; break;
    case 'deadline': t.deadline = isDate(v) ? v : null; break;
    case 'startDate': t.startDate = isDate(v) ? v : null; break;
    case 'subjectId': t.subjectId = v || null; break;
    case 'estimate': {
      const m = parseDur(v, wd);
      if (Number.isNaN(m)) return DUR_ERR;
      t.estimateMin = m; break;
    }
    case 'real': {
      const m = parseDur(v, wd);
      if (Number.isNaN(m)) return DUR_ERR;
      t.realMin = m || 0; break;
    }
    case 'status':
      t.status = v;
      if (v === 'done') { t.progress = 100; t.doneAt = nowIso(); }
      else { t.doneAt = null; if (v === 'todo') t.progress = 0; if (v === 'doing' && t.progress >= 100) t.progress = 90; }
      break;
    case 'progress': {
      const p = Math.max(0, Math.min(100, Math.round(+v || 0)));
      t.progress = p;
      if (p >= 100) { t.status = 'done'; t.doneAt = nowIso(); }
      else if (p > 0 && t.status === 'todo') t.status = 'doing';
      break;
    }
    case 'planMode': t.plan = Object.assign({}, t.plan, { mode: v }); break;
    case 'planDaily': {
      const m = parseDur(v, wd);
      if (Number.isNaN(m)) return DUR_ERR;
      t.plan = Object.assign({}, t.plan, { dailyMin: m }); break;
    }
    default: return false;
  }
  t.updatedAt = nowIso();
  return true;
}

const api = { uid, nowIso, ymd, parseYmd, addDays, isDate, parseDur, blank, normSubject, normTask, migrate,
  isOpen, remaining, bucket, taskCmp, setTaskField, parentOf, childrenOf, subjectStats };
if (typeof module === 'object' && module.exports) module.exports = api;
else root.todoMetier = api;
})(typeof window !== 'undefined' ? window : this);
