// Décision de la Synchro (sync-decision.js) : qui gagne entre cet appareil et GitHub, cas par cas (spec #52)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const D = require('../sync-decision.js');

const sujet = (id, title) => ({ id, title });
const tache = (id, title) => ({ id, subjectId: 's1', title });
const donnees = (...titres) => ({
  version: 1,
  subjects: [sujet('s1', 'Sujet 1')],
  tasks: titres.map((t, i) => tache('t' + i, t)),
  settings: {}
});
const VIDE = { version: 1, subjects: [], tasks: [], settings: {}, pointage: { days: {} } };
const A = donnees('Tâche A');
const B = donnees('Tâche A', 'Tâche B');
const C = donnees('Tâche A', 'Tâche C');
// Dernière synchro faite sur la version v1, quand cet appareil avait les données d
const apres = (d, version = 'v1') => ({ version, empreinte: D.empreinte(d) });
const github = (d, version = 'v2') => ({ version, donnees: d });
const decider = (local, distant, derniere) => D.decider({ local, distant, derniere });
// Chaque question : OK garde cet appareil et l'envoie sur la version de GitHub, Annuler reçoit GitHub
const question = (q, version = 'v2') => ({ action: 'demander', question: q, ok: { action: 'envoyer', depuis: version }, annuler: { action: 'recevoir' } });

test('pas de fichier sur GitHub : premier envoi qui crée le fichier, sauf si cet appareil est vide', () => {
  assert.deepEqual(decider(A, null, null), { action: 'envoyer', depuis: null });
  assert.deepEqual(decider(A, null, apres(A)), { action: 'envoyer', depuis: null });
  assert.deepEqual(decider(VIDE, null, null), { action: 'rien' });
});

test('GitHub inchangé depuis la Dernière synchro : cet appareil modifié est envoyé, non modifié ou vide ne fait rien', () => {
  assert.deepEqual(decider(B, github(A, 'v1'), apres(A)), { action: 'envoyer', depuis: 'v1' });
  assert.deepEqual(decider(A, github(A, 'v1'), apres(A)), { action: 'rien' });
  assert.deepEqual(decider(VIDE, github(A, 'v1'), apres(A)), { action: 'rien' }, 'un appareil vide n\'envoie jamais rien');
});

test('appareil vide face à GitHub rempli : reçoit, qu\'il ait déjà synchronisé ou non', () => {
  assert.deepEqual(decider(VIDE, github(A), null), { action: 'recevoir' });
  assert.deepEqual(decider(VIDE, github(A), apres(B)), { action: 'recevoir' });
});

test('GitHub vide face à un appareil rempli : question « GitHub vide »', () => {
  assert.deepEqual(decider(A, github(VIDE), apres(A)), question('vide'));
  assert.deepEqual(decider(A, github(VIDE), null), question('vide'));
});

test('premier branchement : identique, on adopte sans question ; différent, question « premier branchement »', () => {
  assert.deepEqual(decider(A, github(A), null), { action: 'adopter' });
  assert.deepEqual(decider(A, github(B), null), question('premier'));
});

test('cet appareil non modifié depuis la Dernière synchro : reçoit la version de GitHub', () => {
  assert.deepEqual(decider(A, github(B), apres(A)), { action: 'recevoir' });
});

test('modifiés des deux côtés mais redevenus identiques : on adopte, sans question', () => {
  assert.deepEqual(decider(B, github(B), apres(A)), { action: 'adopter' });
});

test('modifiés des deux côtés et différents : Conflit de synchro', () => {
  assert.deepEqual(decider(B, github(C, 'v7'), apres(A)), question('conflit', 'v7'));
});

test('fichier GitHub de forme invalide : rien ne change ici, et la raison est donnée', () => {
  for (const mauvais of [null, 'texte', { subjects: [] }, { subjects: {}, tasks: [] }])
    assert.deepEqual(decider(A, github(mauvais), apres(A)), { action: 'rien', raison: 'illisible' });
});

test('empreinte : l\'affichage propre à l\'appareil et la date d\'export sont ignorés', () => {
  const avecAffichage = Object.assign({}, A, { ui: { expanded: ['s1'], search: 'x' }, exportedAt: '2026-10-28T09:00:00.000Z' });
  assert.equal(D.empreinte(avecAffichage), D.empreinte(A));
  assert.deepEqual(D.partagees(avecAffichage), A);
  assert.equal(avecAffichage.ui.search, 'x', 'les données de départ ne sont pas touchées');
  assert.notEqual(D.empreinte(B), D.empreinte(A));
  // Même vue et même date d'export sur GitHub : la version reçue n'est pas « modifiée » pour autant
  assert.deepEqual(decider(avecAffichage, github(Object.assign({}, A, { exportedAt: '2026-10-29T10:00:00.000Z' })), apres(A, 'v1')), { action: 'adopter' });
});

test('données vides : ni sujet, ni tâche, ni jour pointé', () => {
  assert.equal(D.vide(VIDE), true);
  assert.equal(D.vide({ subjects: [], tasks: [] }), true);
  assert.equal(D.vide(A), false);
  assert.equal(D.vide({ subjects: [], tasks: [], pointage: { days: { '2026-10-28': {} } } }), false);
});
