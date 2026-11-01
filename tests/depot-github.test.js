// Adaptateur GitHub de la Synchro (depotGitHub dans sync.js) : l'appli parle à un faux GitHub,
// les requêtes vers api.github.com et le lien de téléchargement étant interceptées par la page (spec #52, ticket #54)
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, closeAll, SYNC_CFG, synchroFinie } = require('./helpers');
after(closeAll);

const VIEUX = '2000-01-01T00:00:00.000Z';
const DONNEES = {
  version: 1,
  subjects: [{ id: 'p', title: 'Sujet P', priority: 1, createdAt: VIEUX, updatedAt: VIEUX }],
  tasks: [{ id: 'a', subjectId: 'p', title: 'Tâche A', createdAt: VIEUX, updatedAt: VIEUX }],
  settings: { modules: {} }
};
const DEPOT = 'https://api.github.com/repos/exemple/donnees-fictives';
const FICHIER = DEPOT + '/contents/donnees.json';
const BRUT = 'https://raw.githubusercontent.com/exemple/donnees-fictives/main/donnees.json';
const b64 = s => Buffer.from(s, 'utf8').toString('base64');

// Ouvre un appareil branché (configuration de Synchro fictive) dont GitHub répond par les fonctions données :
// prive (GET du dépôt), lire (GET du fichier), ecrire(corps) (PUT du fichier), brut (lien de téléchargement).
// Chacune rend { status, json } ou { status, texte } ; les requêtes reçues sont gardées dans page.requetes.
async function appareilGitHub(data, { prive = () => ({ status: 200, json: { private: true } }), lire = () => ({ status: 404, json: {} }), ecrire, brut } = {}) {
  const requetes = [];
  const page = await openApp(data, {
    avant: async p => {
      await p.addInitScript(cfg => { if (!sessionStorage.getItem('seeded-sync')) { localStorage.setItem('todo-noel-sync', cfg); sessionStorage.setItem('seeded-sync', '1'); } }, JSON.stringify(SYNC_CFG()));
      await p.route(/^https:\/\/(api\.github\.com|raw\.githubusercontent\.com)\//, route => {
        const r = route.request();
        const url = r.url().replace(/\?.*$/, '');
        const corps = r.postData() ? JSON.parse(r.postData()) : null;
        requetes.push({ methode: r.method(), url, jeton: r.headers().authorization, corps });
        const rep = url === DEPOT ? prive() : url === FICHIER ? (r.method() === 'PUT' ? ecrire(corps) : lire()) : url === BRUT ? brut() : { status: 500, json: {} };
        return route.fulfill({ status: rep.status, contentType: 'application/json', body: rep.texte !== undefined ? rep.texte : JSON.stringify(rep.json) });
      });
    }
  });
  page.requetes = requetes;
  await synchroFinie(page);
  return page;
}
const etat = page => page.evaluate(() => (document.getElementById('sync-side') || {}).textContent || '');
const ecritures = page => page.requetes.filter(r => r.methode === 'PUT');
const lectures = page => page.requetes.filter(r => r.methode === 'GET' && r.url === FICHIER);

test('fichier de plus de 1 Mo : sans contenu dans la réponse, la version est lue par le lien de téléchargement, avec le jeton', async () => {
  const page = await appareilGitHub(null, {
    lire: () => ({ status: 200, json: { sha: 's1', content: '', download_url: BRUT } }),
    brut: () => ({ status: 200, texte: JSON.stringify(DONNEES) })
  });
  assert.deepEqual((await page.db()).tasks.map(t => t.title), ['Tâche A'], 'appareil neuf : la version de GitHub est reçue');
  const telechargement = page.requetes.find(r => r.url === BRUT);
  assert.ok(telechargement, 'le lien de téléchargement est suivi');
  assert.equal(telechargement.jeton, 'Bearer jeton-fictif');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('todo-noel-sync')).sha), 's1');
  assert.deepEqual(ecritures(page), [], 'rien n\'est renvoyé');
  assert.deepEqual(page.errors, []);
});

test('fichier de moins de 1 Mo : le contenu en base 64 de la réponse est lu tel quel', async () => {
  const page = await appareilGitHub(null, { lire: () => ({ status: 200, json: { sha: 's1', content: b64(JSON.stringify(DONNEES)), download_url: BRUT } }) });
  assert.deepEqual((await page.db()).tasks.map(t => t.title), ['Tâche A']);
  assert.ok(!page.requetes.some(r => r.url === BRUT), 'pas de téléchargement à part');
});

test('écriture : premier envoi sans version, contenu en base 64, la nouvelle version est notée', async () => {
  const page = await appareilGitHub(DONNEES, { ecrire: () => ({ status: 201, json: { content: { sha: 's2' } } }) });
  const [envoi] = ecritures(page);
  assert.ok(envoi, 'le fichier est créé');
  assert.equal(envoi.corps.sha, undefined, 'pas de version : création du fichier');
  assert.match(envoi.corps.message, /^Synchro .+ \(PC\)$/);
  assert.deepEqual(JSON.parse(Buffer.from(envoi.corps.content, 'base64').toString('utf8')).tasks.map(t => t.title), ['Tâche A']);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('todo-noel-sync')).sha), 's2');
  assert.doesNotMatch(await etat(page), /à envoyer|⚠/);
});

test('messages d\'erreur de GitHub selon le statut, à la lecture, à l\'écriture et à la vérification du dépôt', async () => {
  const cas = [
    ['lecture 401', { lire: () => ({ status: 401, json: {} }) }, 'jeton refusé ou expiré'],
    ['lecture 403', { lire: () => ({ status: 403, json: {} }) }, 'accès refusé à ce dépôt'],
    ['lecture 500', { lire: () => ({ status: 500, json: {} }) }, 'erreur GitHub 500'],
    ['écriture 404', { ecrire: () => ({ status: 404, json: {} }) }, 'dépôt introuvable'],
    ['dépôt 401', { prive: () => ({ status: 401, json: {} }) }, 'jeton refusé ou expiré'],
    ['dépôt 403', { prive: () => ({ status: 403, json: {} }) }, 'accès refusé à ce dépôt'],
    ['dépôt 404', { prive: () => ({ status: 404, json: {} }) }, 'dépôt introuvable'],
    ['dépôt 502', { prive: () => ({ status: 502, json: {} }) }, 'erreur GitHub 502']
  ];
  for (const [nom, github, message] of cas) {
    const page = await appareilGitHub(DONNEES, github);
    assert.equal(await etat(page), '⚠ Synchro : ' + message, nom);
    await page.context().close();
  }
});

test('409 et 422 à l\'écriture sont un conflit : nouvelle lecture et nouvel essai, puis l\'erreur s\'affiche ; une autre erreur n\'est pas réessayée', async () => {
  for (const status of [409, 422]) {
    const page = await appareilGitHub(DONNEES, { ecrire: () => ({ status, json: {} }) });
    assert.equal(ecritures(page).length, 2, status + ' : un second essai');
    assert.equal(lectures(page).length, 2, status + ' : GitHub est relu avant le second essai');
    assert.equal(await etat(page), '⚠ Synchro : erreur GitHub ' + status);
    assert.equal((await page.db()).tasks.length, 1, 'rien n\'est perdu ici');
    await page.context().close();
  }
  const page = await appareilGitHub(DONNEES, { ecrire: () => ({ status: 500, json: {} }) });
  assert.equal(ecritures(page).length, 1, '500 : pas de second essai');
  assert.equal(await etat(page), '⚠ Synchro : erreur GitHub 500');
});

test('dépôt public : refusé avant toute lecture du fichier, l\'erreur s\'affiche', async () => {
  const page = await appareilGitHub(DONNEES, { prive: () => ({ status: 200, json: { private: false } }) });
  assert.equal(await etat(page), '⚠ Synchro : le dépôt exemple/donnees-fictives est public : synchro bloquée pour ne pas publier tes données');
  assert.deepEqual(page.requetes.map(r => r.url), [DEPOT]);
});
