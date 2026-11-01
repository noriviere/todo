// Règles métier (metier.js) testées directement sous Node, sans navigateur
const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../metier.js');
const { TODAY, day, sujet, tache } = require('./helpers.js');

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

test('tranche d\'échéance selon le jour donné', () => {
  const b = (deadline, td = TODAY) => M.bucket(tache({ deadline }), td);
  assert.equal(b(null), 'nodate');
  assert.equal(b(day(-1)), 'late');
  assert.equal(b(TODAY), 'today');
  assert.equal(b(day(1)), 'tomorrow');
  assert.equal(b(day(2)), 'week');
  assert.equal(b(day(7)), 'week');
  assert.equal(b(day(8)), 'later');
  assert.equal(b(TODAY, day(-1)), 'tomorrow', 'le jour est un paramètre');
});

test('ordre des tâches : échéance, ordre manuel, priorité du sujet, en cours d\'abord, création', () => {
  const d = donnees([sujet({ id: 'P1', priority: 1 }), sujet({ id: 'P3', priority: 3 })], []);
  const cmp = M.taskCmp(d);
  const t = o => tache(Object.assign({ subjectId: 'P3', deadline: day(1), createdAt: '2026-10-01T00:00:00Z' }, o));
  const avant = (a, b, msg) => { assert.ok(cmp(a, b) < 0, msg); assert.ok(cmp(b, a) > 0, msg); };
  avant(t({ deadline: TODAY, order: 9, subjectId: 'P3' }), t({ order: 0, subjectId: 'P1' }), 'échéance la plus proche d\'abord');
  avant(t({ deadline: day(30) }), t({ deadline: null }), 'sans échéance en dernier');
  avant(t({ order: 1, subjectId: 'P3' }), t({ order: 2, subjectId: 'P1' }), 'puis ordre manuel');
  avant(t({ subjectId: 'P1', status: 'todo' }), t({ subjectId: 'P3', status: 'doing' }), 'puis priorité du sujet');
  avant(t({ subjectId: 'P3' }), t({ subjectId: null }), 'boîte de réception après P3');
  avant(t({ status: 'doing', createdAt: '2026-10-09T00:00:00Z' }), t({ status: 'todo' }), 'puis en cours d\'abord');
  avant(t({ createdAt: '2026-10-01T00:00:00Z' }), t({ createdAt: '2026-10-02T00:00:00Z' }), 'puis la plus ancienne');
  assert.equal(cmp(t({}), t({})), 0);
});

test('migration : dimension « Projet » renommée « Code », données vides complétées', () => {
  const d = M.migrate({ subjects: [{ id: 'A', title: 'A', projet: 'X1' }, { id: 'B', projet: 'X2', code: 'C2' }], ui: { dims: { projet: 'X1' } } });
  assert.equal(d.subjects[0].code, 'X1');
  assert.equal(d.subjects[1].code, 'C2', 'un code déjà saisi est gardé');
  assert.ok(!('projet' in d.subjects[0]));
  assert.deepEqual(d.ui.dims, { code: 'X1', secteur: '', produit: '' });
  assert.equal(d.settings.workdayMin, 420);
  assert.deepEqual(d.settings.modules, {});
  assert.deepEqual(d.tasks, []);
  assert.equal(d.subjects[0].priority, 3);
});

test('modification d\'un champ : statut et pourcentage', () => {
  const d = M.blank();
  const t = tache({ status: 'doing', progress: 40 });
  assert.equal(M.setTaskField(t, 'status', 'done', d), true);
  assert.equal(t.progress, 100);
  assert.ok(t.doneAt);
  M.setTaskField(t, 'status', 'todo', d);
  assert.deepEqual([t.progress, t.doneAt], [0, null]);
  M.setTaskField(t, 'progress', '30', d);
  assert.deepEqual([t.status, t.progress], ['doing', 30]);
  M.setTaskField(t, 'progress', '120', d);
  assert.deepEqual([t.status, t.progress], ['done', 100]);
  M.setTaskField(t, 'status', 'doing', d);
  assert.equal(t.progress, 90, 'repassée en cours depuis fait : 90 %');
});

test('modification d\'un champ : durées, dates, champ inconnu', () => {
  const d = M.blank();
  const t = tache({ estimateMin: 30 });
  assert.equal(M.setTaskField(t, 'estimate', '1h30', d), true);
  assert.equal(t.estimateMin, 90);
  M.setTaskField(t, 'estimate', '1j', d);
  assert.equal(t.estimateMin, 420, 'une journée = journée de travail des réglages');
  const err = M.setTaskField(t, 'estimate', 'bientôt', d);
  assert.equal(typeof err, 'string');
  assert.match(err, /Durée non comprise/);
  assert.equal(t.estimateMin, 420, 'durée invalide : rien ne change');
  const maj = t.updatedAt = '2000-01-01T00:00:00.000Z';
  M.setTaskField(t, 'estimate', 'toujours pas', d);
  assert.equal(t.updatedAt, maj, 'durée invalide : date de modification inchangée');
  assert.match(M.setTaskField(t, 'real', 'n/a', d), /Durée non comprise/);
  assert.match(M.setTaskField(t, 'planDaily', '??', d), /Durée non comprise/);
  M.setTaskField(t, 'real', '', d);
  assert.equal(t.realMin, 0);
  M.setTaskField(t, 'deadline', 'pas une date', d);
  assert.equal(t.deadline, null);
  M.setTaskField(t, 'deadline', '2026-11-02', d);
  assert.equal(t.deadline, '2026-11-02');
  assert.equal(M.setTaskField(t, 'inconnu', 'x', d), false);
});

/* ---------- Ranger dans / sortir de (voir CONTEXT.md) ---------- */
const arbre = () => donnees([
  sujet({ id: 'P', title: 'Parent' }), sujet({ id: 'Q', title: 'Autre' }),
  sujet({ id: 'E', title: 'Enfant', parentId: 'P' }), sujet({ id: 'L', title: 'Libre' })], []);
const s_ = (d, id) => d.subjects.find(s => s.id === id);

test('ranger un sujet dans un autre, puis l\'en sortir', () => {
  const d = arbre();
  assert.deepEqual(M.ranger(s_(d, 'L'), 'Q', d), { ancien: null });
  assert.equal(s_(d, 'L').parentId, 'Q');
  assert.deepEqual(M.ranger(s_(d, 'L'), null, d), { ancien: s_(d, 'Q') });
  assert.equal(s_(d, 'L').parentId, null);
  assert.equal(M.ranger(s_(d, 'L'), null, d), null, 'déjà au premier niveau : rien ne change');
});

test('ranger ailleurs donne l\'ancien parent et ne touche aucun autre champ', () => {
  const d = arbre(), e = s_(d, 'E');
  Object.assign(e, { after: ['X'], lagDays: 3 });
  assert.deepEqual(M.ranger(e, 'Q', d), { ancien: s_(d, 'P') });
  assert.equal(e.parentId, 'Q');
  assert.deepEqual([e.after, e.lagDays], [['X'], 3]);
});

test('un seul niveau : ce qui ne peut pas être rangé', () => {
  const d = arbre();
  assert.equal(M.peutEtreRange(s_(d, 'P'), d), false, 'a un sous-sujet');
  s_(d, 'E').archived = true;
  assert.equal(M.peutEtreRange(s_(d, 'P'), d), false, 'a un sous-sujet archivé');
  assert.equal(M.peutRanger(s_(d, 'L'), s_(d, 'E'), d), false, 'cible sous-sujet');
  assert.equal(M.peutRanger(s_(d, 'L'), s_(d, 'L'), d), false, 'soi-même');
  s_(d, 'Q').archived = true;
  assert.equal(M.peutRanger(s_(d, 'L'), s_(d, 'Q'), d), false, 'cible archivée');
  assert.equal(M.ranger(s_(d, 'L'), 'Q', d), null);
  assert.equal(s_(d, 'L').parentId, null);
  assert.equal(M.peutRanger(s_(d, 'L'), s_(d, 'P'), d), true);
});

test('un refus fourni par un module empêche de ranger, pas de sortir', () => {
  const d = arbre(), refus = [s => s.id === 'L' || s.id === 'E'];
  assert.equal(M.peutEtreRange(s_(d, 'L'), d, refus), false);
  assert.equal(M.peutRanger(s_(d, 'L'), s_(d, 'P'), d, refus), false);
  assert.equal(M.ranger(s_(d, 'L'), 'P', d, refus), null);
  assert.deepEqual(M.ranger(s_(d, 'E'), null, d, refus), { ancien: s_(d, 'P') });
});

test('premier niveau : sans parent, ou parent archivé', () => {
  const d = arbre();
  assert.equal(M.estPremierNiveau(s_(d, 'P'), d), true);
  assert.equal(M.estPremierNiveau(s_(d, 'E'), d), false);
  s_(d, 'P').archived = true;
  assert.equal(M.estPremierNiveau(s_(d, 'E'), d), true);
});

test('archiver un sujet archive ses sous-sujets ; restaurer ne rend que ceux archivés avec lui', () => {
  const d = arbre();
  d.subjects.push(sujet({ id: 'F', title: 'Déjà archivé', parentId: 'P', archived: true, archivedAt: 'avant' }));
  M.archiverSujet(s_(d, 'P'), d, true, 'T1');
  assert.deepEqual(['P', 'E', 'F'].map(id => s_(d, id).archived), [true, true, true]);
  assert.equal(s_(d, 'E').archivedAt, 'T1');
  assert.equal(s_(d, 'F').archivedAt, 'avant');
  M.archiverSujet(s_(d, 'P'), d, false);
  assert.deepEqual(['P', 'E', 'F'].map(id => s_(d, id).archived), [false, false, true]);
  assert.equal(s_(d, 'E').archivedAt, null);
  assert.equal(s_(d, 'E').parentId, 'P', 'archiver ne sort pas du parent');
});
