// Prévision de la Charge (charge-plan.js) : calcul pur testé sous Node avec le vrai calendrier commun de metier.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../charge-plan.js');
const M = require('../metier.js');

// Horaire de Noel : 7h45 du lundi au jeudi, 4h le vendredi ; fériés français (11 novembre 2026 : mercredi)
const NOEL = [0, 465, 465, 465, 465, 240, 0];
const cal = (absences = {}) => M.calendrier({ horaire: NOEL }, ds => absences[ds] || null);
const LUNDI = '2026-11-02';
const ouverte = (o = {}) => Object.assign({ id: 'x', status: 'todo', estimateMin: 60, realMin: 0 }, o);
// Prévision sur n jours à partir du lundi 2 novembre ; taches : [tâche] ou [{ t, pr }]
function prevoir(taches, o = {}) {
  const liste = taches.map(x => x.t ? x : { t: x, pr: 0 });
  return C.prevision({ taches: liste, creneaux: o.creneaux || [], cal: o.cal || cal(), jour: o.jour || LUNDI, n: o.n || 14, libelleAbsence: o.libelleAbsence });
}
// Minutes de tâches placées par jour (jours sans tâche omis)
const placees = fc => Object.fromEntries(fc.days.filter(d => d.taskMin).map(d => [d.date, d.taskMin]));
// Jours où un créneau donné a lieu
const joursDu = (fc, id) => fc.days.filter(d => d.fixed.some(s => s.id === id)).map(d => d.date);

test('échéance simple : tout le temps restant le dernier jour où l\'on peut travailler avant l\'échéance', () => {
  assert.deepEqual(placees(prevoir([ouverte({ deadline: '2026-11-04', estimateMin: 120 })])), { '2026-11-04': 120 });
  // Échéance un dimanche : le vendredi
  assert.deepEqual(placees(prevoir([ouverte({ deadline: '2026-11-08' })])), { '2026-11-06': 60 });
  // Échéance le 11 novembre (férié) : le mardi 10
  assert.deepEqual(placees(prevoir([ouverte({ deadline: '2026-11-11' })])), { '2026-11-10': 60 });
});

test('le temps restant vient de metier.js : estimé moins réel, ou estimé × part restante en cours avec un pourcentage', () => {
  const fc = prevoir([ouverte({ id: 'a', deadline: '2026-11-03', estimateMin: 90, realMin: 30 }),
    ouverte({ id: 'b', deadline: '2026-11-04', estimateMin: 120, status: 'doing', progress: 75, realMin: 10 })]);
  assert.deepEqual(placees(fc), { '2026-11-03': 60, '2026-11-04': 30 });
});

test('réparti jusqu\'à l\'échéance : le reste étalé à la minute près sur les jours possibles, à partir du début', () => {
  const sp = o => ouverte(Object.assign({ plan: { mode: 'spread' } }, o));
  assert.deepEqual(placees(prevoir([sp({ deadline: '2026-11-06', estimateMin: 103 })])),
    { '2026-11-02': 21, '2026-11-03': 21, '2026-11-04': 21, '2026-11-05': 20, '2026-11-06': 20 });
  assert.deepEqual(placees(prevoir([sp({ startDate: '2026-11-04', deadline: '2026-11-06', estimateMin: 10 })])),
    { '2026-11-04': 4, '2026-11-05': 3, '2026-11-06': 3 });
  // Week-end et 11 novembre sautés
  assert.deepEqual(placees(prevoir([sp({ startDate: '2026-11-06', deadline: '2026-11-12', estimateMin: 120 })])),
    { '2026-11-06': 30, '2026-11-09': 30, '2026-11-10': 30, '2026-11-12': 30 });
});

test('X par jour : X chaque jour possible jusqu\'à épuiser le reste, en retard s\'il finit après l\'échéance', () => {
  const dly = o => ouverte(Object.assign({ plan: { mode: 'daily', dailyMin: 60 }, estimateMin: 200 }, o));
  const tard = prevoir([dly({ deadline: '2026-11-04' })]);
  assert.deepEqual(placees(tard), { '2026-11-02': 60, '2026-11-03': 60, '2026-11-04': 60, '2026-11-05': 20 });
  assert.equal(tard.days[0].items[0].al.late, true);
  assert.equal(prevoir([dly({ deadline: '2026-11-05' })]).days[0].items[0].al.late, false);
  // Sans échéance, la tâche est placée quand même ; le 11 novembre est sauté
  const sans = prevoir([dly({ estimateMin: 120 })], { jour: '2026-11-10' });
  assert.deepEqual(placees(sans), { '2026-11-10': 60, '2026-11-12': 60 });
  assert.deepEqual(sans.unplanned, []);
});

test('en retard : tout le reste le premier jour possible à partir d\'aujourd\'hui', () => {
  const fc = prevoir([ouverte({ deadline: '2026-10-30', estimateMin: 90 })]);
  assert.deepEqual(placees(fc), { '2026-11-02': 90 });
  assert.equal(fc.days[0].items[0].al.overdue, true);
  // Un samedi : le lundi suivant
  assert.deepEqual(placees(prevoir([ouverte({ deadline: '2026-10-30' })], { jour: '2026-11-07' })), { '2026-11-09': 60 });
});

test('sans échéance et sans durée estimée : listées à part, non comptées', () => {
  const a = ouverte({ id: 'a' }), b = ouverte({ id: 'b', estimateMin: 0, deadline: '2026-11-03' });
  const fc = prevoir([a, b]);
  assert.deepEqual(fc.unplanned, [a]);
  assert.deepEqual(fc.noEst, [b]);
  assert.deepEqual(placees(fc), {});
  assert.equal(fc.after, 0);
});

test('au-delà de l\'horizon : les minutes placées après les n jours sont comptées à part', () => {
  const fc = prevoir([ouverte({ deadline: '2026-11-13' }),
    ouverte({ id: 'r', plan: { mode: 'spread' }, deadline: '2026-11-13', estimateMin: 100 })], { n: 7 });
  // 9 jours possibles du 2 au 13 (11 novembre férié) : 12 + 11 × 8 ; 5 dans l'horizon (12 + 4 × 11 = 56)
  assert.deepEqual(placees(fc), { '2026-11-02': 12, '2026-11-03': 11, '2026-11-04': 11, '2026-11-05': 11, '2026-11-06': 11 });
  assert.equal(fc.after, 60 + 44);
  assert.equal(fc.days.length, 7);
});

test('créneaux fixes : chaque fréquence revient les bons jours, entre son début et sa fin, jamais archivé', () => {
  const creneaux = [
    { id: 'hebdo', durMin: 60, freq: 'weekly', days: [2], start: '2026-11-10', end: '2026-11-24' },
    { id: 'quinze', durMin: 30, freq: 'biweekly', days: [1], start: '2026-11-02' },
    { id: 'date', durMin: 30, freq: 'monthday', start: '2026-10-17' },
    { id: 'rang', durMin: 30, freq: 'monthweek', start: '2026-10-06' },
    { id: 'une', durMin: 45, freq: 'once', start: '2026-11-05' },
    { id: 'archive', durMin: 60, freq: 'weekly', days: [1, 2, 3, 4, 5], archived: true },
    { id: 'vide', durMin: 0, freq: 'weekly', days: [1, 2, 3, 4, 5] }
  ];
  const fc = prevoir([], { creneaux, n: 35 });
  assert.deepEqual(joursDu(fc, 'hebdo'), ['2026-11-10', '2026-11-17', '2026-11-24']);
  assert.deepEqual(joursDu(fc, 'quinze'), ['2026-11-02', '2026-11-16', '2026-11-30']);
  assert.deepEqual(joursDu(fc, 'date'), ['2026-11-17']);
  assert.deepEqual(joursDu(fc, 'rang'), ['2026-11-03', '2026-12-01']);
  assert.deepEqual(joursDu(fc, 'une'), ['2026-11-05']);
  assert.deepEqual(joursDu(fc, 'archive'), []);
  assert.deepEqual(joursDu(fc, 'vide'), []);
  assert.equal(fc.days.find(d => d.date === '2026-11-17').fixedMin, 90);
});

test('créneau « Chaque jour travaillé » : chaque jour travaillé du calendrier, ni week-end, ni férié, ni congé d\'une journée', () => {
  const fc = prevoir([], { creneaux: [{ id: 'j', durMin: 15, freq: 'daily' }], cal: cal({ '2026-11-12': 'full' }), n: 14 });
  assert.deepEqual(joursDu(fc, 'j'), ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06',
    '2026-11-09', '2026-11-10', '2026-11-13']);
});

test('jour entièrement pris par des créneaux fixes : aucun travail ce jour-là', () => {
  const creneaux = [{ id: 'lundi', durMin: 465, freq: 'weekly', days: [1] }];
  const fc = prevoir([ouverte({ id: 'e', deadline: '2026-11-09' }), ouverte({ id: 'r', deadline: '2026-10-30' }),
    ouverte({ id: 'x', plan: { mode: 'daily', dailyMin: 30 }, estimateMin: 60 })], { creneaux });
  assert.deepEqual(placees(fc), { '2026-11-03': 60 + 30, '2026-11-04': 30, '2026-11-06': 60 });
  assert.equal(fc.days[0].free, 0);
});

test('férié : une ligne « Férié : … » prend la journée, sans créneau fixe ni travail', () => {
  const creneaux = [{ id: 'mer', durMin: 60, freq: 'weekly', days: [3] }];
  const fc = prevoir([ouverte({ plan: { mode: 'daily', dailyMin: 60 }, estimateMin: 180 })], { creneaux, jour: '2026-11-10' });
  const j = fc.days.find(d => d.date === '2026-11-11');
  assert.deepEqual(j.fixed.map(s => [s.title, s.durMin, s.virtual]), [['Férié : Armistice', 465, true]]);
  assert.deepEqual([j.cap, j.fixedMin, j.taskMin, j.free], [465, 465, 0, 0]);
  assert.deepEqual(placees(fc), { '2026-11-10': 60, '2026-11-12': 60, '2026-11-13': 60 });
});

test('congé d\'une journée : il prend la journée avec son nom, sans créneau fixe ni travail', () => {
  const creneaux = [{ id: 'jeu', durMin: 60, freq: 'weekly', days: [4] }];
  const c = cal({ '2026-11-05': 'full' });
  const fc = prevoir([ouverte({ deadline: '2026-11-05' })], { creneaux, cal: c, libelleAbsence: ds => ds === '2026-11-05' ? 'Congés payés' : null });
  const j = fc.days.find(d => d.date === '2026-11-05');
  assert.deepEqual(j.fixed.map(s => [s.title, s.durMin]), [['Congés payés', 465]]);
  assert.deepEqual(placees(fc), { '2026-11-04': 60 });
  // Sans nom : « Absence »
  assert.equal(prevoir([], { cal: c }).days[3].fixed[0].title, 'Absence');
});

test('demi-journée le vendredi à 4h : tout le vendredi est pris ; un jeudi, la moitié d\'une journée pleine', () => {
  const c = cal({ '2026-11-06': 'am', '2026-11-12': 'pm' });
  const fc = prevoir([ouverte({ id: 'v', deadline: '2026-11-06' }), ouverte({ id: 'j', deadline: '2026-11-12' })], { cal: c });
  const v = fc.days.find(d => d.date === '2026-11-06'), j = fc.days.find(d => d.date === '2026-11-12');
  assert.deepEqual([v.cap, v.fixedMin], [240, 240]);
  assert.deepEqual([j.cap, j.fixedMin], [465, 232]);
  assert.deepEqual(placees(fc), { '2026-11-05': 60, '2026-11-12': 60 });
});

test('capacité du jour : l\'horaire de la semaine type, 0 le week-end', () => {
  const fc = prevoir([], { n: 7 });
  assert.deepEqual(fc.days.map(d => [d.cap, d.work]), [[465, true], [465, true], [465, true], [465, true], [240, true], [0, false], [0, false]]);
});

test('tâches d\'un jour triées par priorité du sujet puis par durée ; minutes par priorité', () => {
  const t = (id, pr, min) => ({ t: ouverte({ id, deadline: '2026-11-02', estimateMin: min }), pr });
  const fc = prevoir([t('p2', 2, 60), t('p1c', 1, 30), t('p1l', 1, 90), t('p0', 0, 120), t('p3', 3, 10)]);
  const j = fc.days[0];
  assert.deepEqual(j.items.map(x => x.t.id), ['p1l', 'p1c', 'p2', 'p3', 'p0']);
  assert.deepEqual(j.byPrio, { 1: 120, 2: 60, 3: 10, 0: 120 });
  assert.deepEqual([j.taskMin, j.load, j.free], [310, 310, 155]);
});
