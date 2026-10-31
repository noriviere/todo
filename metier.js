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

/* ---------- Calendrier (CONTEXT.md « Calendrier ») ---------- */
// Semaine type par défaut : du lundi au vendredi (0 = dimanche)
const SEMAINE_TYPE = [1, 2, 3, 4, 5];
const UN_AN = 366;   // borne des recherches de jour : on ne cherche jamais plus loin qu'un an
const JOURS_LONGS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const semaineType = settings => settings && Array.isArray(settings.workDays) && settings.workDays.length ? settings.workDays : SEMAINE_TYPE;
const lundi = ds => addDays(ds, -((parseYmd(ds).getDay() + 6) % 7));
// Numéro de semaine ISO 8601 : la semaine 1 contient le premier jeudi de l'année
const semaineIso = ds => { const jeudi = addDays(lundi(ds), 3); return 1 + Math.floor(Math.round((parseYmd(jeudi) - parseYmd(jeudi.slice(0, 4) + '-01-01')) / 864e5) / 7); };
// Jours fériés de France métropolitaine d'une année : { 'AAAA-MM-JJ': nom }
const feriesCache = {};
function paques(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), dd = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(new Date(y, month - 1, dd));
}
function feries(y) {
  if (feriesCache[y]) return feriesCache[y];
  const e = paques(y), r = {};
  [['01-01', "Jour de l'an"], ['05-01', 'Fête du travail'], ['05-08', 'Victoire 1945'], ['07-14', 'Fête nationale'],
   ['08-15', 'Assomption'], ['11-01', 'Toussaint'], ['11-11', 'Armistice'], ['12-25', 'Noël']].forEach(([md, n]) => { r[y + '-' + md] = n; });
  r[addDays(e, 1)] = 'Lundi de Pâques';
  r[addDays(e, 39)] = 'Ascension';
  r[addDays(e, 50)] = 'Lundi de Pentecôte';
  return (feriesCache[y] = r);
}
// Calendrier d'après les réglages (semaine type, fériés automatiques) et les absences de Noel :
// absenceDe(jour) → 'full' | 'am' | 'pm' | null, fourni par le module Pointage quand il est actif.
function calendrier(settings, absenceDe = () => null) {
  const sem = semaineType(settings), avecFeries = !settings || settings.feries !== false;
  const ferie = ds => avecFeries ? feries(+ds.slice(0, 4))[ds] || null : null;
  const ouvre = ds => sem.includes(parseYmd(ds).getDay()) && !ferie(ds);
  const absence = ds => absenceDe(ds) || null;
  const travaille = ds => ouvre(ds) && absence(ds) !== 'full';
  // Le jour lui-même s'il convient, sinon le suivant (au plus un an plus loin : absence posée sur toute l'année)
  const suivant = test => ds => { let d = ds; for (let i = 0; i < UN_AN && !test(d); i++) d = addDays(d, 1); return d; };
  const ouvreSuivant = suivant(ouvre), travailleSuivant = suivant(travaille);
  const ajouterOuvres = (ds, n) => { let d = ds; for (let k = 0; k < n; k++) d = ouvreSuivant(addDays(d, 1)); return d; };
  const ouvresEntre = (a, b) => { let n = 0; for (let d = a; d <= b; d = addDays(d, 1)) if (ouvre(d)) n++; return n; };
  // Pourquoi un jour n'est pas travaillé : { ferie: nom } | { jour: 'samedi' } | { absence: part } ; null s'il l'est
  const raison = ds => {
    if (travaille(ds)) return null;
    if (ferie(ds)) return { ferie: ferie(ds) };
    if (!sem.includes(parseYmd(ds).getDay())) return { jour: JOURS_LONGS[parseYmd(ds).getDay()] };
    return { absence: absence(ds) };
  };
  // Premier jour férié à partir de ds (enSemaine : tombant un jour de la semaine type), null sans fériés
  const prochainFerie = (ds, o = {}) => {
    if (!avecFeries) return null;
    for (let d = ds, i = 0; i < UN_AN * 2; i++, d = addDays(d, 1)) if (ferie(d) && (!o.enSemaine || sem.includes(parseYmd(d).getDay()))) return d;
    return null;
  };
  return { semaine: sem, ferie, ouvre, absence, travaille, raison, prochainFerie, ouvreSuivant, travailleSuivant, ajouterOuvres, ouvresEntre };
}
// Échéance d'une occurrence de récurrence qui tombe un jour non travaillé, selon la règle des réglages :
// 'suivant' (par défaut) le jour travaillé suivant, 'precedent' le précédent mais jamais avant aujourd'hui
// (alors aujourd'hui, ou le jour travaillé suivant), 'aucun' la date telle quelle.
const DECALAGES = [['suivant', 'Jour travaillé suivant'], ['precedent', 'Jour travaillé précédent'], ['aucun', 'Ne pas décaler']];
function decaler(date, regle, cal, aujourdhui) {
  if (regle === 'aucun' || cal.travaille(date)) return { date, decalee: false };
  if (regle === 'precedent') {
    let d = date;
    for (let i = 0; i < UN_AN && !cal.travaille(d); i++) d = addDays(d, -1);
    if (d < aujourdhui) d = cal.travailleSuivant(aujourdhui);
    return { date: d, decalee: d !== date };
  }
  const d = cal.travailleSuivant(date);
  return { date: d, decalee: d !== date };
}

// Tâches ouvertes et visibles (ni archivées, ni dans un sujet archivé) dont l'échéance tombe un des jours donnés
function echeancesLes(d, jours) {
  const set = new Set(jours), archives = new Set((d.subjects || []).filter(s => s.archived).map(s => s.id));
  return (d.tasks || []).filter(t => isOpen(t) && !t.archived && !archives.has(t.subjectId) && set.has(t.deadline));
}

/* ---------- Récurrence : occurrence suivante ---------- */
// n mois après ds, au jour d'ancrage de la série (le 31 revient le 31, ou le dernier jour des mois plus courts)
function ajouterMois(ds, n, jour) {
  const d = parseYmd(ds), j = jour || d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(j, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return ymd(d);
}
function pasRecurrence(ds, r, cal, jour) {
  if (r.freq === 'workday') return cal.travailleSuivant(addDays(ds, 1));   // ni week-end, ni férié, ni congé d'une journée
  if (r.freq === 'week') return addDays(ds, 7 * r.interval);
  if (r.freq === 'month') return ajouterMois(ds, r.interval, jour);
  return ajouterMois(ds, 12 * r.interval, jour);
}
// Échéance de l'occurrence suivante d'une tâche récurrente → { date, theorique, decalee, decaleeDe, jour }.
// La date théorique part de la théorique de la précédente (decaleeDe), jamais de la date décalée, au jour
// d'ancrage de la série (recur.jour) ; faite en retard, on saute à la prochaine à venir ; puis decaler().
function prochaineEcheance(t, cal, regle, aujourdhui) {
  const base = t.decaleeDe || t.deadline || aujourdhui;
  const jour = t.recur.jour || parseYmd(base).getDate();
  let n = pasRecurrence(base, t.recur, cal, jour);
  for (let i = 0; i < 1000 && n < aujourdhui; i++) n = pasRecurrence(n, t.recur, cal, jour);
  if (t.recur.freq === 'workday') return { date: n, theorique: n, decalee: false, decaleeDe: null, jour };
  const r = decaler(n, regle, cal, aujourdhui);
  return Object.assign(r, { theorique: n, decaleeDe: r.decalee ? n : null, jour });
}

/* ---------- Données ---------- */
function blank() {
  return {
    version: 1,
    subjects: [],
    tasks: [],
    settings: { theme: 'auto', workdayMin: 420, lastExport: null, modules: {}, workDays: SEMAINE_TYPE.slice(), feries: true, decalage: 'suivant' },
    ui: { expanded: [], showClosed: false, search: '', dims: { code: '', secteur: '', produit: '' } }
  };
}
function normSubject(s) {
  const now = nowIso();
  return Object.assign({
    id: uid(), title: '', priority: 3, description: '', code: '', secteur: '', produit: '', archived: false, archivedAt: null,
    createdAt: now, updatedAt: now, source: null, parentId: null
  }, s);
}
function normTask(t) {
  const now = nowIso();
  return Object.assign({
    id: uid(), subjectId: null, title: '', notes: '',
    deadline: null, startDate: null,
    // Occurrence de récurrence décalée hors d'un jour non travaillé : sa date théorique
    decaleeDe: null,
    estimateMin: null,
    status: 'todo', progress: 0,
    archived: false, archivedAt: null,
    createdAt: now, updatedAt: now, doneAt: null,
    // Temps réel : chrono et saisie à la main
    realMin: 0, timeLogs: [], timerStart: null,
    // Placement dans la Charge : 'deadline' = tout le jour J, 'spread' = réparti de startDate à deadline, 'daily' = dailyMin par jour
    plan: { mode: 'deadline', dailyMin: null },
    source: null
  }, t);
}

function migrate(d) {
  const b = blank();
  const feriesAvant = d && d.settings && d.settings.feries;
  d = Object.assign(b, d);
  d.settings = Object.assign(blank().settings, d.settings);
  if (!d.settings.modules || typeof d.settings.modules !== 'object') d.settings.modules = {};
  // Fériés automatiques : réglage commun, repris de l'ancienne case du Pointage
  if (typeof feriesAvant !== 'boolean') d.settings.feries = !(d.pointage && d.pointage.holidays === false);
  if (!Array.isArray(d.settings.workDays)) d.settings.workDays = SEMAINE_TYPE.slice();
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
    case 'deadline': {
      const nd = isDate(v) ? v : null;
      // Échéance changée à la main : ce n'est plus une occurrence décalée
      if (nd !== t.deadline) t.decaleeDe = null;
      t.deadline = nd;
      break;
    }
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

/* ---------- Historique des modifications (Annuler / Rétablir) ---------- */
// Photo des données : tout sauf l'affichage (ui), le thème, les modules actifs et la date du dernier export,
// qui ne s'annulent pas. Gardée en texte : légère et impossible à modifier par erreur.
const HORS_PHOTO = ['theme', 'modules', 'lastExport'];
function photo(d) {
  const settings = Object.assign({}, d.settings);
  HORS_PHOTO.forEach(k => delete settings[k]);
  const o = Object.assign({}, d, { settings });
  delete o.ui;
  return JSON.stringify(o);
}
// Données d'une photo, avec l'affichage, le thème et les modules actuels
function remettre(cur, p) {
  const d = JSON.parse(p);
  d.ui = cur.ui;
  d.settings = d.settings || {};
  HORS_PHOTO.forEach(k => { if (cur.settings && k in cur.settings) d.settings[k] = cur.settings[k]; });
  return d;
}
// Date de modification sur chaque tâche et sujet qui a changé depuis la photo « avant » (les créés gardent la leur)
function horodater(avant, d, now = nowIso()) {
  const a = JSON.parse(avant);
  const sans = x => JSON.stringify(Object.assign({}, x, { updatedAt: null }));
  for (const k of ['tasks', 'subjects']) {
    const prev = new Map((a[k] || []).map(x => [x.id, sans(x)]));
    for (const x of d[k] || []) if (prev.has(x.id) && prev.get(x.id) !== sans(x)) x.updatedAt = now;
  }
}
// Les deux photos ne diffèrent que par des dates de modification (champ revalidé sans changement)
function memesDonnees(a, b) {
  if (a === b) return true;
  const sans = p => { const d = JSON.parse(p); ['tasks', 'subjects'].forEach(k => (d[k] || []).forEach(x => { x.updatedAt = null; })); return JSON.stringify(d); };
  return sans(a) === sans(b);
}
// Deux piles : ce qu'on peut annuler (le plus récent en dernier) et ce qu'on peut rétablir
function historique(max = 50) {
  let passe = [], futur = [];
  const dernier = l => l.length ? l[l.length - 1] : null;
  return {
    enregistrer(e) { passe.push(e); if (passe.length > max) passe.shift(); futur = []; },
    annuler() { const e = passe.pop() || null; if (e) futur.push(e); return e; },
    retablir() { const e = futur.pop() || null; if (e) passe.push(e); return e; },
    prochainAnnuler: () => dernier(passe),
    prochainRetablir: () => dernier(futur),
    vider() { passe = []; futur = []; }
  };
}

const api = { uid, nowIso, pad, ymd, parseYmd, addDays, isDate, parseDur, SEMAINE_TYPE, lundi, semaineIso, feries, calendrier, decaler, prochaineEcheance, DECALAGES, echeancesLes, blank, normSubject, normTask, migrate,
  isOpen, remaining, bucket, taskCmp, setTaskField, parentOf, childrenOf, subjectStats,
  photo, remettre, horodater, memesDonnees, historique };
if (typeof module === 'object' && module.exports) module.exports = api;
else root.todoMetier = api;
})(typeof window !== 'undefined' ? window : this);
