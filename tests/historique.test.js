// Historique des modifications (règles pures de metier.js), testé sous Node
const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../metier.js');

const pas = n => ({ libelle: 'Modif ' + n, avant: 'a' + n, apres: 'b' + n });

test('annuler remonte les modifications de la plus récente à la plus ancienne, rétablir les refait', () => {
  const h = M.historique();
  assert.equal(h.annuler(), null, 'rien à annuler au départ');
  h.enregistrer(pas(1)); h.enregistrer(pas(2));
  assert.equal(h.prochainAnnuler().libelle, 'Modif 2');
  assert.equal(h.annuler().libelle, 'Modif 2');
  assert.equal(h.annuler().libelle, 'Modif 1');
  assert.equal(h.annuler(), null);
  assert.equal(h.prochainRetablir().libelle, 'Modif 1');
  assert.equal(h.retablir().libelle, 'Modif 1');
  assert.equal(h.retablir().libelle, 'Modif 2');
  assert.equal(h.retablir(), null);
});

test('une nouvelle modification après une annulation vide la liste à rétablir', () => {
  const h = M.historique();
  h.enregistrer(pas(1)); h.enregistrer(pas(2));
  h.annuler();
  h.enregistrer(pas(3));
  assert.equal(h.retablir(), null);
  assert.equal(h.annuler().libelle, 'Modif 3');
  assert.equal(h.annuler().libelle, 'Modif 1');
});

test('l\'historique garde les 50 dernières modifications', () => {
  const h = M.historique();
  for (let i = 1; i <= 55; i++) h.enregistrer(pas(i));
  let n = 0, last;
  while ((last = h.annuler())) { n++; if (n === 50) assert.equal(last.libelle, 'Modif 6'); }
  assert.equal(n, 50);
});

test('vider l\'historique : plus rien à annuler ni à rétablir', () => {
  const h = M.historique();
  h.enregistrer(pas(1)); h.enregistrer(pas(2)); h.annuler();
  h.vider();
  assert.equal(h.prochainAnnuler(), null);
  assert.equal(h.prochainRetablir(), null);
});

const donnees = () => Object.assign(M.blank(), {
  subjects: [M.normSubject({ id: 'S', title: 'Sujet' })],
  tasks: [M.normTask({ id: 'T', subjectId: 'S', title: 'Tâche' })],
  pointage: { days: { '2026-10-28': { in: '08:30' } } }
});

test('la photo des données laisse de côté l\'affichage, le thème, les modules actifs et la date d\'export', () => {
  const d = donnees();
  const p = M.photo(d);
  d.ui.search = 'abc'; d.ui.expanded = ['S'];
  d.settings.theme = 'dark'; d.settings.modules = { projet: true }; d.settings.lastExport = '2026-10-28T10:00:00.000Z';
  assert.equal(M.photo(d), p, 'ces changements ne changent pas la photo');
  d.settings.workdayMin = 480;
  assert.notEqual(M.photo(d), p, 'les réglages de travail en font partie');
});

test('remettre une photo garde l\'affichage, le thème et les modules actuels', () => {
  const d = donnees();
  const p = M.photo(d);
  d.tasks[0].title = 'Changée'; d.tasks.push(M.normTask({ title: 'Nouvelle' }));
  d.pointage.days['2026-10-28'].out = '17:00';
  d.ui.expanded = ['S']; d.settings.theme = 'dark'; d.settings.modules = { chrono: false };
  const r = M.remettre(d, p);
  assert.equal(r.tasks.length, 1);
  assert.equal(r.tasks[0].title, 'Tâche');
  assert.deepEqual(r.pointage.days['2026-10-28'], { in: '08:30' });
  assert.deepEqual(r.ui.expanded, ['S']);
  assert.equal(r.settings.theme, 'dark');
  assert.deepEqual(r.settings.modules, { chrono: false });
});

test('date de modification : posée seulement sur les tâches et sujets changés', () => {
  const d = donnees();
  d.tasks.push(M.normTask({ id: 'U', title: 'Autre' }));
  d.subjects.push(M.normSubject({ id: 'R', title: 'Autre sujet' }));
  const vieux = '2000-01-01T00:00:00.000Z';
  [...d.tasks, ...d.subjects].forEach(x => { x.updatedAt = vieux; });
  const avant = M.photo(d);
  d.tasks[0].title = 'Changée';
  d.subjects[1].priority = 1;
  const neuve = M.normTask({ id: 'N', title: 'Créée' });
  d.tasks.push(neuve);
  const now = '2026-10-28T09:00:00.000Z';
  M.horodater(avant, d, now);
  assert.equal(d.tasks[0].updatedAt, now);
  assert.equal(d.tasks[1].updatedAt, vieux, 'tâche non touchée');
  assert.equal(d.subjects[0].updatedAt, vieux, 'sujet non touché');
  assert.equal(d.subjects[1].updatedAt, now);
  assert.equal(neuve.updatedAt, neuve.createdAt, 'une tâche créée garde createdAt === updatedAt');
});

test('une tâche ou un sujet créé a la même date de création et de modification', () => {
  for (let i = 0; i < 200; i++) {
    const t = M.normTask({}), s = M.normSubject({});
    assert.equal(t.updatedAt, t.createdAt);
    assert.equal(s.updatedAt, s.createdAt);
  }
});

test('mêmes données : seule la date de modification change, ce n\'est pas une modification', () => {
  const d = donnees();
  const a = M.photo(d);
  d.tasks[0].updatedAt = '2030-01-01T00:00:00.000Z';
  d.subjects[0].updatedAt = '2030-01-01T00:00:00.000Z';
  assert.equal(M.memesDonnees(a, M.photo(d)), true);
  d.tasks[0].title = 'Autre';
  assert.equal(M.memesDonnees(a, M.photo(d)), false);
});
