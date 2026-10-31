// Calendrier commun (metier.js) : jours fériés, ouvrés, travaillés — voir CONTEXT.md « Calendrier »
const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../metier.js');

const cal = (settings = {}, absences = {}) => M.calendrier(Object.assign(M.blank().settings, settings), ds => absences[ds] || null);

test('jours fériés français, jours mobiles compris', () => {
  const f = M.feries(2026);
  assert.equal(f['2026-11-11'], 'Armistice');
  assert.equal(f['2026-04-06'], 'Lundi de Pâques');
  assert.equal(f['2026-05-14'], 'Ascension');
  assert.equal(f['2026-05-25'], 'Lundi de Pentecôte');
  assert.equal(Object.keys(f).length, 11);
  assert.equal(cal().ferie('2026-11-11'), 'Armistice');
  assert.equal(cal().ferie('2026-11-12'), null);
});

test('jour ouvré : semaine type, sans les fériés', () => {
  const c = cal();
  assert.equal(c.ouvre('2026-11-10'), true, 'mardi');
  assert.equal(c.ouvre('2026-11-14'), false, 'samedi');
  assert.equal(c.ouvre('2026-11-11'), false, 'férié');
  assert.equal(cal({ feries: false }).ouvre('2026-11-11'), true, 'fériés décochés');
  assert.equal(cal({ feries: false }).ferie('2026-11-11'), null);
  const sam = cal({ workDays: [1, 2, 3, 4, 5, 6] });
  assert.equal(sam.ouvre('2026-11-14'), true, 'samedi dans la semaine type');
  assert.equal(cal({ workDays: [2, 3, 4, 5] }).ouvre('2026-11-09'), false, 'lundi hors semaine type');
});

test('semaine type par défaut : du lundi au vendredi', () => {
  assert.deepEqual(M.blank().settings.workDays, [1, 2, 3, 4, 5]);
  assert.equal(M.calendrier({}).ouvre('2026-11-14'), false, 'réglages vides');
  assert.equal(M.calendrier({ workDays: [] }).ouvre('2026-11-10'), true, 'semaine type vide : défaut');
});

test('jour travaillé : jour ouvré sans absence d\'une journée entière', () => {
  const c = cal({}, { '2026-11-12': 'full', '2026-11-13': 'am' });
  assert.equal(c.travaille('2026-11-10'), true);
  assert.equal(c.travaille('2026-11-12'), false, 'congé');
  assert.equal(c.travaille('2026-11-13'), true, 'demi-journée');
  assert.equal(c.absence('2026-11-13'), 'am');
  assert.equal(c.absence('2026-11-10'), null);
  assert.equal(c.travaille('2026-11-11'), false, 'férié');
  assert.equal(c.travaille('2026-11-14'), false, 'samedi');
  assert.equal(c.ouvre('2026-11-12'), true, 'un congé ne change pas le jour ouvré');
});

test('sans absences fournies (Pointage désactivé) : travaillé = ouvré', () => {
  const c = M.calendrier(M.blank().settings);
  assert.equal(c.travaille('2026-11-12'), true);
  assert.equal(c.absence('2026-11-12'), null);
});

test('jour ouvré suivant, ajout de jours ouvrés, jours ouvrés entre deux dates', () => {
  const c = cal();
  assert.equal(c.ouvreSuivant('2026-11-10'), '2026-11-10', 'le jour lui-même');
  assert.equal(c.ouvreSuivant('2026-11-11'), '2026-11-12', 'férié');
  assert.equal(c.ouvreSuivant('2026-11-14'), '2026-11-16', 'week-end');
  assert.equal(c.ajouterOuvres('2026-11-10', 1), '2026-11-12');
  assert.equal(c.ajouterOuvres('2026-11-09', 4), '2026-11-16');
  assert.equal(c.ajouterOuvres('2026-11-09', 0), '2026-11-09');
  assert.equal(c.ouvresEntre('2026-11-09', '2026-11-16'), 5, 'férié au milieu');
  assert.equal(c.ouvresEntre('2026-11-16', '2026-11-09'), 0);
});

test('jour travaillé suivant : saute fériés et congés', () => {
  const c = cal({}, { '2026-11-12': 'full', '2026-11-13': 'full' });
  assert.equal(c.travailleSuivant('2026-11-11'), '2026-11-16');
  assert.equal(c.travailleSuivant('2026-11-10'), '2026-11-10');
});

test('lundi de la semaine', () => {
  assert.equal(M.lundi('2026-11-15'), '2026-11-09');
  assert.equal(M.lundi('2026-11-09'), '2026-11-09');
});

test('migration : le choix des fériés du Pointage est repris', () => {
  assert.equal(M.migrate({}).settings.feries, true, 'par défaut');
  assert.equal(M.migrate({ pointage: { holidays: false } }).settings.feries, false);
  assert.equal(M.migrate({ pointage: { holidays: true } }).settings.feries, true);
  assert.equal(M.migrate({ settings: { feries: true }, pointage: { holidays: false } }).settings.feries, true, 'déjà migré');
  assert.deepEqual(M.migrate({ settings: { workDays: [1, 2, 3] } }).settings.workDays, [1, 2, 3]);
});

/* ---------- Décalage d'une échéance de récurrence (ticket #37) ---------- */
const conge = cal({}, { '2026-11-12': 'full', '2026-11-13': 'full', '2026-11-16': 'am' });

test('décalage : un jour travaillé ne bouge pas', () => {
  assert.deepEqual(M.decaler('2026-11-10', 'suivant', conge, '2026-10-28'), { date: '2026-11-10', decalee: false });
});

test('décalage par défaut : au jour travaillé suivant (rapport du dimanche 1er novembre → lundi 2)', () => {
  assert.equal(M.blank().settings.decalage, 'suivant');
  assert.deepEqual(M.decaler('2026-11-01', 'suivant', cal(), '2026-10-28'), { date: '2026-11-02', decalee: true });
  assert.equal(M.decaler('2026-11-11', 'suivant', conge, '2026-10-28').date, '2026-11-16', 'férié puis congé ; la demi-journée est travaillée');
  assert.equal(M.decaler('2026-11-11', undefined, conge, '2026-10-28').date, '2026-11-16', 'règle absente : suivant');
});

test('décalage au jour travaillé précédent', () => {
  assert.deepEqual(M.decaler('2026-11-01', 'precedent', cal(), '2026-10-28'), { date: '2026-10-30', decalee: true });
  assert.equal(M.decaler('2026-11-13', 'precedent', conge, '2026-10-28').date, '2026-11-10', 'congé puis férié');
});

test('« précédent » ne remonte jamais avant aujourd\'hui', () => {
  assert.equal(M.decaler('2026-11-01', 'precedent', cal(), '2026-10-31').date, '2026-11-02', 'aujourd\'hui samedi : jour travaillé suivant');
  assert.equal(M.decaler('2026-11-01', 'precedent', cal(), '2026-10-30').date, '2026-10-30', 'aujourd\'hui vendredi');
  assert.equal(M.decaler('2026-11-14', 'precedent', conge, '2026-11-12').date, '2026-11-16', 'aujourd\'hui en congé');
});

test('« ne pas décaler » garde la date', () => {
  assert.deepEqual(M.decaler('2026-11-01', 'aucun', cal(), '2026-10-28'), { date: '2026-11-01', decalee: false });
});

test('migration : la règle de décalage par défaut est ajoutée', () => {
  assert.equal(M.migrate({}).settings.decalage, 'suivant');
  assert.equal(M.migrate({ settings: { decalage: 'aucun' } }).settings.decalage, 'aucun');
  assert.equal(M.normTask({}).decaleeDe, null);
});

test('échéance changée à la main : la date théorique d\'un décalage disparaît', () => {
  const t = M.normTask({ deadline: '2026-11-02', decaleeDe: '2026-11-01' });
  M.setTaskField(t, 'deadline', '2026-11-05');
  assert.equal(t.decaleeDe, null);
});
