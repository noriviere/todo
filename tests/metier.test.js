// Règles métier (metier.js) testées directement sous Node, sans navigateur
const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../metier.js');
const { TODAY, day } = require('./helpers.js');

const sujet = (o = {}) => M.normSubject(Object.assign({ id: 'S', title: 'Sujet' }, o));
const tache = (o = {}) => M.normTask(Object.assign({ subjectId: 'S' }, o));
const donnees = (subjects, tasks) => Object.assign(M.blank(), { subjects, tasks });
const etat = (subjects, tasks, s = subjects[0]) => M.subjectStats(s, donnees(subjects, tasks), TODAY);

test('temps restant du sujet : le temps réel déjà passé est retiré, comme dans Charge', () => {
  const st = etat([sujet()], [tache({ estimateMin: 120, realMin: 30 })]);
  assert.equal(st.remainMin, 90);
});

test('temps restant d\'une tâche : règle du glossaire', () => {
  const r = o => M.remaining(tache(o));
  assert.equal(r({ estimateMin: 120, status: 'doing', progress: 25, realMin: 100 }), 90, 'en cours avec % : estimé × part restante');
  assert.equal(r({ estimateMin: 120, status: 'doing', progress: 0, realMin: 20 }), 100, 'en cours sans % : estimé − réel');
  assert.equal(r({ estimateMin: 120, realMin: 30 }), 90, 'à faire avec réel');
  assert.equal(r({ estimateMin: 60, status: 'waiting' }), 60, 'en attente');
  assert.equal(r({ estimateMin: 60, realMin: 90 }), 0, 'estimation dépassée : jamais négatif');
  assert.equal(r({ estimateMin: null, realMin: 30 }), 0, 'sans estimation');
});

test('temps restant du sujet : seules les tâches ouvertes comptent', () => {
  const st = etat([sujet()], [
    tache({ estimateMin: 60 }), tache({ estimateMin: 60, status: 'waiting' }),
    tache({ estimateMin: 60, status: 'done', progress: 100 }), tache({ estimateMin: 60, status: 'cancelled' })]);
  assert.equal(st.remainMin, 120);
});

test('état d\'un sujet : statut selon ses tâches', () => {
  const statut = (...ts) => etat([sujet()], ts.map(o => tache(o))).status;
  assert.equal(statut(), 'empty');
  assert.equal(statut({ status: 'cancelled' }), 'cancelled');
  assert.equal(statut({ status: 'waiting' }, { status: 'cancelled' }), 'waiting');
  assert.equal(statut({ status: 'done' }, { status: 'cancelled' }), 'done');
  assert.equal(statut({ status: 'done' }, {}), 'doing');
  assert.equal(statut({ status: 'doing' }, { status: 'waiting' }), 'doing');
  assert.equal(statut({}, { status: 'waiting' }), 'todo');
});

test('état d\'un sujet : avancement pondéré par le temps estimé (60 min par défaut)', () => {
  const st = etat([sujet()], [
    tache({ estimateMin: 180, status: 'done', progress: 100 }),
    tache({ estimateMin: null, status: 'doing', progress: 50 }),
    tache({ estimateMin: 600, status: 'cancelled' })]);
  // (180 × 100 + 60 × 50) / 240
  assert.equal(st.progress, 88);
  assert.equal(st.estMin, 240);
  assert.deepEqual([st.total, st.live, st.open, st.done], [3, 2, 1, 1]);
});

test('état d\'un sujet : tâches des sous-sujets actifs comptées, archivées ignorées', () => {
  const p = sujet({ id: 'P' }), c = sujet({ id: 'C', parentId: 'P' }), arch = sujet({ id: 'A', parentId: 'P', archived: true });
  const st = etat([p, c, arch], [
    tache({ subjectId: 'P' }), tache({ subjectId: 'C' }), tache({ subjectId: 'A' }), tache({ subjectId: 'C', archived: true })], p);
  assert.equal(st.total, 2);
  assert.equal(st.children, 1);
});

test('état d\'un sujet : retards et prochaine échéance selon le jour donné', () => {
  const ts = [tache({ deadline: day(-2) }), tache({ deadline: day(-1), status: 'done' }), tache({ deadline: day(3) }), tache({ deadline: day(1) })];
  const st = etat([sujet()], ts);
  assert.equal(st.late, 1);
  assert.equal(st.next, day(-2));
  const plusTot = M.subjectStats(sujet(), donnees([sujet()], ts), day(-5));
  assert.equal(plusTot.late, 0);
});
