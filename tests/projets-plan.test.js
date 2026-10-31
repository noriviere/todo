const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../projets-plan.js');
const M = require('../metier.js');
// Semaine du lundi au vendredi, sans fériés (les cas avec fériés sont plus bas)
const WD = M.calendrier({ workDays: [1, 2, 3, 4, 5], feries: false });
const run = (steps, ms = []) => P.schedule(steps, ms, WD);

test('jours ouvrés', () => {
  assert.equal(WD.ouvreSuivant('2026-10-24'), '2026-10-26');
  assert.equal(WD.ouvreSuivant('2026-10-26'), '2026-10-26');
  assert.equal(WD.ajouterOuvres('2026-10-23', 1), '2026-10-26');
  assert.equal(WD.ajouterOuvres('2026-10-23', 0), '2026-10-23');
});

test('chaîne simple', () => {
  const r = run([{ id: 'A', plan: { start: '2026-11-02', durDays: 5 } }, { id: 'B', plan: { durDays: 3 }, after: ['A'] }]);
  assert.deepEqual(r.byId.A, { start: '2026-11-02', end: '2026-11-06' });
  assert.deepEqual(r.byId.B, { start: '2026-11-09', end: '2026-11-11' });
  assert.deepEqual(r.order, ['A', 'B']);
});

test('plusieurs prédécesseurs : la plus tardive l\'emporte', () => {
  const r = run([
    { id: 'FAT', plan: { start: '2026-11-16', durDays: 5 } },        // fin 20/11
    { id: 'Racc', plan: { start: '2026-11-19', durDays: 5 } },       // fin 25/11
    { id: 'Dech', plan: { start: '2026-11-16', durDays: 3 } },       // fin 18/11
    { id: 'SAT', plan: { durDays: 2 }, after: ['FAT', 'Racc', 'Dech'] }
  ]);
  assert.equal(r.byId.Racc.end, '2026-11-25');
  assert.equal(r.byId.SAT.start, '2026-11-26');
});

test('décalage en jours ouvrés', () => {
  const r = run([{ id: 'A', plan: { start: '2026-11-02', durDays: 5 } }, { id: 'B', plan: { durDays: 1 }, after: ['A'], lagDays: 2 }]);
  assert.equal(r.byId.B.start, '2026-11-11');
});

test('saisies limites', () => {
  const r = run([
    { id: 'W', plan: { start: '2026-10-24', durDays: 1 } },
    { id: 'Z', plan: { start: '2026-11-02', durDays: 0 } },
    { id: 'N', plan: { start: '2026-11-02', durDays: -4 } },
    { id: 'L', plan: { durDays: 1 }, after: ['Z'], lagDays: -3 }
  ]);
  assert.equal(r.byId.W.start, '2026-10-26');
  assert.deepEqual(r.byId.Z, { start: '2026-11-02', end: '2026-11-02' });
  assert.deepEqual(r.byId.N, { start: '2026-11-02', end: '2026-11-02' });
  assert.equal(r.byId.L.start, '2026-11-03');
});

test('étapes non planifiées et références mortes', () => {
  const r = run([
    { id: 'U', plan: {} },
    { id: 'V', plan: { start: '2026-11-02', durDays: 2 }, after: ['U', 'inconnu'] },
    { id: 'X', plan: { durDays: 2 }, after: ['U'] }
  ]);
  assert.deepEqual(r.unplanned.sort(), ['U', 'X']);
  assert.equal(r.byId.V.start, '2026-11-02');
  assert.equal(r.byId.U, undefined);
});

test('alertes de jalon', () => {
  const steps = [{ id: 'A', plan: { start: '2026-11-02', durDays: 5 } }, { id: 'B', plan: { durDays: 3 }, after: ['A'] }];
  const late = run(steps, [{ id: 'm1', name: 'Livraison', date: '2026-11-10', before: ['B', 'inconnu'] }]);
  assert.deepEqual(late.alerts, [{ milestoneId: 'm1', subjectId: 'B' }]);
  const ok = run(steps, [{ id: 'm1', name: 'Livraison', date: '2026-11-11', before: ['B'] }]);
  assert.deepEqual(ok.alerts, []);
});

test('détection de boucle', () => {
  const steps = [{ id: 'A' }, { id: 'B', after: ['A'] }, { id: 'C', after: ['B'] }];
  assert.equal(P.wouldCycle(steps, 'C', 'A'), true);   // « A après C »
  assert.equal(P.wouldCycle(steps, 'A', 'C'), false);  // « C après A »
  assert.equal(P.wouldCycle(steps, 'A', 'A'), true);
});

test('données corrompues en boucle : pas de plantage', () => {
  const r = run([{ id: 'A', plan: { start: '2026-11-02', durDays: 1 }, after: ['B'] }, { id: 'B', plan: { durDays: 1 }, after: ['A'] }]);
  assert.deepEqual(r.unplanned.sort(), ['A', 'B']);
});

test('lignes du Gantt', () => {
  const steps = [{ id: 'U', plan: {} }, { id: 'A', plan: { start: '2026-11-02', durDays: 5 } }, { id: 'B', plan: { durDays: 3 }, after: ['A'] }];
  const ms = [{ id: 'm2', name: 'Paiement', date: '2026-12-01' }, { id: 'm1', name: 'Livraison', date: '2026-11-10' }];
  const rows = P.buildRows(steps, P.schedule(steps, ms, WD), ms);
  assert.deepEqual(rows.map(r => r.kind + ':' + r.id), ['jalon:m1', 'jalon:m2', 'etape:A', 'etape:B']);
  assert.deepEqual(rows[2], { kind: 'etape', id: 'A', parentId: null, start: '2026-11-02', end: '2026-11-06', depth: 0 });
  assert.equal(rows[0].start, '2026-11-10');
  assert.equal(rows[0].end, '2026-11-10');
});

// Avec le calendrier commun : les fériés ne sont pas ouvrés (le congé de Noel ne compte pas)
const OUVRE = M.calendrier(M.blank().settings, ds => ds === '2026-11-13' ? 'full' : null);

test('calendrier : une étape de 5 jours du lundi 9 novembre finit le lundi 16 (11 novembre férié)', () => {
  const r = P.schedule([{ id: 'A', plan: { start: '2026-11-09', durDays: 5 } }], [], OUVRE);
  assert.deepEqual(r.byId.A, { start: '2026-11-09', end: '2026-11-16' });
});

test('calendrier : un début posé un jour férié part du jour ouvré suivant', () => {
  const r = P.schedule([{ id: 'A', plan: { start: '2026-11-11', durDays: 1 } }], [], OUVRE);
  assert.equal(r.byId.A.start, '2026-11-12');
});

test('calendrier : un férié fait passer un jalon en alerte', () => {
  const steps = [{ id: 'A', plan: { start: '2026-11-09', durDays: 5 } }];
  const ms = [{ id: 'J', date: '2026-11-13', before: ['A'] }];
  assert.equal(P.schedule(steps, ms, WD).alerts.length, 0, 'sans fériés : fin le 13');
  assert.deepEqual(P.schedule(steps, ms, OUVRE).alerts, [{ milestoneId: 'J', subjectId: 'A' }]);
});
