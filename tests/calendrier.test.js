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
  const sam = cal({ horaire: [0, 420, 420, 420, 420, 420, 240] });
  assert.equal(sam.ouvre('2026-11-14'), true, 'samedi dans la semaine type');
  assert.equal(cal({ horaire: [0, 0, 420, 420, 420, 420, 0] }).ouvre('2026-11-09'), false, 'lundi à 0h : hors semaine type');
});

test('semaine type par défaut : du lundi au vendredi', () => {
  assert.deepEqual(M.blank().settings.horaire, [0, 420, 420, 420, 420, 420, 0]);
  assert.deepEqual(M.calendrier(M.blank().settings).semaine, [1, 2, 3, 4, 5]);
  assert.equal(M.calendrier({}).ouvre('2026-11-14'), false, 'réglages vides');
  assert.equal(M.calendrier({ workDays: [] }).ouvre('2026-11-10'), true, 'ancienne semaine type vide : défaut');
  assert.equal(M.calendrier({ workDays: [1, 2, 3] }).ouvre('2026-11-12'), false, 'données pas encore migrées : l\'ancienne semaine type');
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
  assert.deepEqual(M.migrate({ settings: { workDays: [1, 2, 3] } }).settings.workDays, [1, 2, 3], 'ancien champ gardé');
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

/* ---------- Occurrence suivante d'une récurrence (règle déplacée dans le noyau) ---------- */
const suivante = (t, c = cal(), regle = 'suivant', td = '2026-10-28') => M.prochaineEcheance(t, c, regle, td);

test('récurrence mensuelle : le rapport du 31 revient le 31, sans dérive vers le 28', () => {
  let t = { deadline: '2026-10-31', recur: { freq: 'month', interval: 1 } };
  const theo = [], dates = [];
  for (let i = 0; i < 6; i++) {
    const r = suivante(t);
    theo.push(r.theorique); dates.push(r.date);
    t = { deadline: r.date, decaleeDe: r.decalee ? r.theorique : null, recur: Object.assign({}, t.recur, { jour: r.jour }) };
  }
  assert.deepEqual(theo, ['2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
  assert.deepEqual(dates, ['2026-11-30', '2026-12-31', '2027-02-01', '2027-03-01', '2027-03-31', '2027-04-30'], 'dimanches décalés au lundi');
});

test('récurrence : le 1er novembre 2026 (dimanche) devient le lundi 2 ; repart de la date théorique', () => {
  const r = suivante({ deadline: '2026-10-01', recur: { freq: 'month', interval: 1 } });
  assert.deepEqual([r.date, r.theorique, r.decalee], ['2026-11-02', '2026-11-01', true]);
  const r2 = suivante({ deadline: '2026-11-02', decaleeDe: '2026-11-01', recur: { freq: 'month', interval: 1, jour: 1 } });
  assert.equal(r2.theorique, '2026-12-01');
});

test('« Chaque jour travaillé » : saute le 11 novembre et un congé, jamais décalée', () => {
  const r = suivante({ deadline: '2026-11-10', recur: { freq: 'workday', interval: 1 } }, conge);
  assert.deepEqual([r.date, r.decalee], ['2026-11-16', false], 'férié 11, congés 12 et 13, demi-journée le 16');
});

test('récurrence faite en retard : saute à la prochaine échéance à venir, puis décale', () => {
  const r = suivante({ deadline: '2026-09-01', recur: { freq: 'week', interval: 1 } }, cal(), 'suivant', '2026-10-28');
  assert.equal(r.date, '2026-11-03');
});

test('raison d\'un jour non travaillé', () => {
  assert.equal(conge.raison('2026-11-10'), null);
  assert.deepEqual(conge.raison('2026-11-11'), { ferie: 'Armistice' });
  assert.deepEqual(conge.raison('2026-11-14'), { jour: 'samedi' });
  assert.deepEqual(conge.raison('2026-11-12'), { absence: 'full' });
});

test('prochain férié, en semaine ou non', () => {
  assert.equal(cal().prochainFerie('2026-10-28'), '2026-11-01');
  assert.equal(cal().prochainFerie('2026-10-28', { enSemaine: true }), '2026-11-11', 'le 1er novembre 2026 est un dimanche');
  assert.equal(cal({ feries: false }).prochainFerie('2026-10-28'), null);
});

test('échéances ouvertes des jours donnés : ni faites, ni archivées, ni dans un sujet archivé', () => {
  const d = Object.assign(M.blank(), {
    subjects: [M.normSubject({ id: 'S' }), M.normSubject({ id: 'X', archived: true })],
    tasks: [M.normTask({ id: 'a', subjectId: 'S', deadline: '2026-11-12' }), M.normTask({ id: 'b', subjectId: 'S', deadline: '2026-11-12', status: 'done' }),
      M.normTask({ id: 'c', subjectId: 'S', deadline: '2026-11-12', archived: true }), M.normTask({ id: 'e', subjectId: 'X', deadline: '2026-11-12' }),
      M.normTask({ id: 'f', subjectId: 'S', deadline: '2026-11-14' }), M.normTask({ id: 'g', subjectId: null, deadline: '2026-11-13' })]
  });
  assert.deepEqual(M.echeancesLes(d, ['2026-11-12', '2026-11-13']).map(t => t.id), ['a', 'g']);
});

test('occurrence décalée : la date théorique à garder est donnée', () => {
  assert.equal(suivante({ deadline: '2026-10-01', recur: { freq: 'month', interval: 1 } }).decaleeDe, '2026-11-01');
  assert.equal(suivante({ deadline: '2026-10-02', recur: { freq: 'month', interval: 1 } }).decaleeDe, null);
});

test('numéro de semaine ISO : la semaine 1 contient le premier jeudi de l\'année', () => {
  assert.equal(M.semaineIso('2026-10-28'), 44);
  assert.equal(M.semaineIso('2026-01-01'), 1);       // un jeudi
  assert.equal(M.semaineIso('2026-12-31'), 53);      // 2026 compte 53 semaines
  assert.equal(M.semaineIso('2027-01-03'), 53);      // dimanche, encore la semaine 53 de 2026
  assert.equal(M.semaineIso('2027-01-04'), 1);
  assert.equal(M.semaineIso('2024-12-30'), 1);       // lundi, déjà la semaine 1 de 2025
  assert.equal(M.semaineIso('2026-03-30'), 14);      // lendemain du passage à l'heure d'été
});
