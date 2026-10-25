const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../projets-plan.js');
const WD = [1, 2, 3, 4, 5];
const run = (steps, ms = []) => P.schedule(steps, ms, WD);

test('jours ouvrés', () => {
  assert.equal(P.nextWorkday('2026-10-24', WD), '2026-10-26');
  assert.equal(P.nextWorkday('2026-10-26', WD), '2026-10-26');
  assert.equal(P.addWorkdays('2026-10-23', 1, WD), '2026-10-26');
  assert.equal(P.addWorkdays('2026-10-23', 0, WD), '2026-10-23');
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
