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

// Durées en minutes : "1h30", "1.5h", "45min", "45m", "2" (= heures), "1j" (= une journée pleine) ; vide = null, illisible = NaN
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
// Semaine type par défaut : du lundi au vendredi (0 = dimanche), 7h par jour
const SEMAINE_TYPE = [1, 2, 3, 4, 5];
const JOURNEE_DEFAUT = 420;
const UN_AN = 366;   // borne des recherches de jour : on ne cherche jamais plus loin qu'un an
const JOURS_LONGS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
// Horaire de la semaine type : minutes prévues pour chaque jour, indexé par getDay() (0 = dimanche) ; un jour à 0 n'en fait pas partie
const horaireValide = h => Array.isArray(h) && h.length === 7 && h.every(m => Number.isFinite(m) && m >= 0) && h.some(m => m > 0);
const horaireSur = (jours, min) => [0, 1, 2, 3, 4, 5, 6].map(wd => jours.includes(wd) ? min : 0);
// Horaire des réglages ; sinon (données d'avant l'horaire commun) chaque jour de l'ancienne semaine type (workDays) prend
// l'Objectif par jour du Pointage (dayMin) s'il est > 0, sinon l'ancienne capacité d'une journée (workdayMin) ; les autres jours, 0
function horaireDe(settings, pointage) {
  const s = settings || {};
  if (horaireValide(s.horaire)) return s.horaire;
  const jours = Array.isArray(s.workDays) && s.workDays.length ? s.workDays : SEMAINE_TYPE;
  const capacite = s.workdayMin > 0 ? s.workdayMin : JOURNEE_DEFAUT, dm = pointage && pointage.dayMin;
  const duree = wd => { const m = dm && typeof dm === 'object' ? Math.round(+dm[wd] || 0) : 0; return m > 0 ? m : capacite; };
  return [0, 1, 2, 3, 4, 5, 6].map(wd => jours.includes(wd) ? duree(wd) : 0);
}
const semaineType = settings => horaireDe(settings).map((m, wd) => m > 0 ? wd : -1).filter(wd => wd >= 0).sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
// Journée pleine : le plus long horaire de la semaine type, ce que vaut « 1j »
const journeePleine = settings => Math.max(...horaireDe(settings));
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
  const horaire = horaireDe(settings), sem = semaineType(settings), pleine = journeePleine(settings), avecFeries = !settings || settings.feries !== false;
  const ferie = ds => avecFeries ? feries(+ds.slice(0, 4))[ds] || null : null;
  const ouvre = ds => sem.includes(parseYmd(ds).getDay()) && !ferie(ds);
  const absence = ds => absenceDe(ds) || null;
  const travaille = ds => ouvre(ds) && absence(ds) !== 'full';
  // Horaire du jour de la semaine (férié compris), puis heures prévues : 0 hors semaine type ou férié, 0 un jour d'absence.
  // Une demi-journée d'absence retire la moitié d'une journée pleine ; un jour qui est déjà une demi-journée (horaire plus
  // proche d'une demi-journée que d'une journée pleine, soit au plus ses 3/4 : le vendredi à 4h) est entièrement libéré.
  const horaireDu = ds => horaire[parseYmd(ds).getDay()];
  const heuresPrevues = ds => {
    if (!ouvre(ds)) return 0;
    const a = absence(ds), h = horaireDu(ds);
    if (a === 'full') return 0;
    if (!a) return h;
    return h <= pleine * 3 / 4 ? 0 : Math.max(0, Math.round(h - pleine / 2));
  };
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
  return { semaine: sem, horaire, journeePleine: pleine, horaireDu, heuresPrevues, ferie, ouvre, absence, travaille, raison, prochainFerie, ouvreSuivant, travailleSuivant, ajouterOuvres, ouvresEntre };
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

/* ---------- Pointage : temps pointé et semaine complète (CONTEXT.md « Temps pointé », « Semaine complète ») ---------- */
const enMin = s => { if (!s) return null; const [h, m] = s.split(':').map(Number); return h * 60 + m; };
// Temps pointé d'un jour (heures « HH:MM » : in, lunchOut, lunchIn, out), en minutes. Les heures pointées ne sont jamais réécrites.
// Jour passé : Arrivée → Départ moins le repas ; sans Départ, Arrivée → Début repas ; sans Départ ni Début repas, 0.
// Le jour même : en cours jusqu'à maintenant (live), figé au début du repas pendant la pause.
// maintenant : minutes écoulées depuis minuit. Rend { min, live, open } (open : pas de départ pointé).
function tempsPointe(jour, ds, aujourdhui, maintenant) {
  if (!jour || !jour.in) return { min: 0, live: false, open: false };
  const pause = jour.lunchOut && !jour.lunchIn;
  let fin = enMin(jour.out), live = false, repas = !!(jour.lunchOut && jour.lunchIn);
  if (fin == null) {
    if (ds === aujourdhui) { fin = pause ? enMin(jour.lunchOut) : maintenant; live = !pause; }
    else if (jour.lunchOut) { fin = enMin(jour.lunchOut); repas = false; }
    else return { min: 0, live: false, open: true };
  }
  let min = fin - enMin(jour.in);
  if (repas) min -= Math.max(0, enMin(jour.lunchIn) - enMin(jour.lunchOut));
  return { min: Math.max(0, min), live, open: !jour.out };
}
// Semaine complète : semaine finie dont chaque jour à horaire > 0 a du temps pointé, sans absence ni férié, quel que soit le total.
// Un jour à horaire 0 (samedi travaillé) ne change rien. Aujourd'hui n'est fini qu'une fois le départ pointé.
// cal : le calendrier (horaireDu, ferie) ; o : { jour(ds) → jour pointé, aujourdhui, maintenant,
//       debut, fin : bornes facultatives de la période comptée (un jour hors d'elles rend la semaine incomplète) }
function semaineComplete(lundiDs, cal, o) {
  for (let i = 0; i < 7; i++) {
    const ds = addDays(lundiDs, i);
    if (!(cal.horaireDu(ds) > 0)) continue;
    const j = o.jour(ds);
    if ((o.debut && ds < o.debut) || (o.fin && ds > o.fin)) return false;
    if (ds > o.aujourdhui || (ds === o.aujourdhui && !(j && j.out))) return false;
    if (cal.ferie(ds) || (j && j.abs)) return false;
    if (!(tempsPointe(j, ds, o.aujourdhui, o.maintenant).min > 0)) return false;
  }
  return true;
}

/* ---------- Données ---------- */
function blank() {
  return {
    version: 1,
    subjects: [],
    tasks: [],
    settings: { theme: 'auto', lastExport: null, modules: {}, horaire: horaireSur(SEMAINE_TYPE, JOURNEE_DEFAUT), feries: true, decalage: 'suivant' },
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
  // Horaire commun de la semaine type, repris des anciens réglages (Objectif par jour du Pointage, capacité de la Charge),
  // calculé avant que les réglages par défaut ne le remplissent. Les anciens champs restent dans les données (autre appareil pas à jour).
  const horaireAvant = horaireDe(d && d.settings, d && d.pointage).slice();
  d = Object.assign(b, d);
  d.settings = Object.assign(blank().settings, d.settings);
  if (!d.settings.modules || typeof d.settings.modules !== 'object') d.settings.modules = {};
  // Fériés automatiques : réglage commun, repris de l'ancienne case du Pointage
  if (typeof feriesAvant !== 'boolean') d.settings.feries = !(d.pointage && d.pointage.holidays === false);
  d.settings.horaire = horaireAvant;
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
  return d;
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
// Premier niveau à l'affichage : sans parent, ou dont le parent est archivé (sous-sujet restauré seul)
const estPremierNiveau = (s, d) => { const p = parentOf(s, d); return !p || p.archived; };
// Ranger dans / sortir de (CONTEXT.md). refus : prédicats fournis par les modules (ex. un sujet en mode projet)
const peutEtreRange = (s, d, refus = []) => !d.subjects.some(x => x.parentId === s.id && x !== s) && !refus.some(f => f(s));
const peutRanger = (s, cible, d, refus = []) => !!cible && cible !== s && !cible.parentId && !cible.archived && peutEtreRange(s, d, refus);
// Range s dans le sujet cibleId, ou l'en sort (cibleId vide). Ne touche que parentId ; renvoie { ancien } ou null si rien ne change
function ranger(s, cibleId, d, refus = []) {
  const cible = cibleId ? subjOf(d, cibleId) : null;
  if (cibleId && !peutRanger(s, cible, d, refus)) return null;
  const ancien = parentOf(s, d);
  if ((ancien && ancien.id) === (cible && cible.id)) return null;
  s.parentId = cible ? cible.id : null;
  return { ancien };
}
// Archiver un sujet archive ses sous-sujets ; la restauration ne rend que ceux archivés avec lui. Ne sort personne de son parent
function archiverSujet(s, d, on = true, maintenant = nowIso()) {
  childrenOf(s, d, true).forEach(c => {
    if (on && !c.archived) { c.archivedWithParent = true; c.archived = true; c.archivedAt = maintenant; }
    else if (!on && c.archivedWithParent) { c.archivedWithParent = false; c.archived = false; c.archivedAt = null; }
  });
  s.archived = on; s.archivedAt = on ? maintenant : null;
  if (!on) s.archivedWithParent = false;
}

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
  const wd = journeePleine(d && d.settings);
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

const api = { uid, nowIso, pad, ymd, parseYmd, addDays, isDate, parseDur, SEMAINE_TYPE, horaireDe, journeePleine, lundi, semaineIso, feries, calendrier, decaler, prochaineEcheance, tempsPointe, semaineComplete, DECALAGES, echeancesLes, blank, normSubject, normTask, migrate,
  isOpen, remaining, bucket, taskCmp, setTaskField, parentOf, childrenOf, estPremierNiveau, peutEtreRange, peutRanger, ranger, archiverSujet, subjectStats,
  photo, remettre, horodater, memesDonnees, historique };
if (typeof module === 'object' && module.exports) module.exports = api;
else root.todoMetier = api;
})(typeof window !== 'undefined' ? window : this);
