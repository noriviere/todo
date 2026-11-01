// Synchro PC ↔ téléphone de bout en bout : deux appareils (contextes de navigateur séparés) partagent un faux dépôt (spec #52)
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { closeAll, day, ctrl, ailleurs, aller, fauxDepot, appareil, synchroFinie, synchroniser } = require('./helpers');
after(closeAll);

const VIEUX = '2000-01-01T00:00:00.000Z';
const sujet = (id, title) => ({ id, title, priority: 1, createdAt: VIEUX, updatedAt: VIEUX });
const tache = (id, title) => ({ id, subjectId: 'p', title, deadline: day(0), createdAt: VIEUX, updatedAt: VIEUX });
const base = () => ({
  version: 1,
  subjects: [sujet('p', 'Sujet P')],
  tasks: [tache('a', 'Tâche A'), tache('b', 'Tâche B'), tache('c', 'Tâche C')],
  settings: { modules: {} }, ui: { expanded: ['p'] }
});
const autre = () => ({ version: 1, subjects: [sujet('p', 'Sujet P'), sujet('q', 'Sujet Q')], tasks: [tache('x', 'Tâche X')], settings: { modules: {} } });
const IMPORT_KEY = 'todo-noel-v1-avant-import';
const POINT_IMPORT = { [IMPORT_KEY]: JSON.stringify({ subjects: [sujet('i', 'Copie d\'avant import')], tasks: [] }), [IMPORT_KEY + '-date']: '2026-10-01T08:00:00.000Z' };
const pointImport = page => page.evaluate(k => [localStorage.getItem(k), localStorage.getItem(k + '-date')], IMPORT_KEY);

const tacheDe = (d, id) => d.tasks.find(t => t.id === id);
const ligne = (page, id) => page.locator(`#main .task[data-tid="${id}"]`).first();
const cocher = async (page, id) => { await aller(page, 'dashboard'); await ligne(page, id).locator('[data-act="toggle-done"]').click(); };
const archiver = async (page, id) => { await aller(page, 'dashboard'); await ligne(page, id).locator('[data-act="archive-task"]').click(); };
// État de la Synchro dans la barre latérale (☁, « à envoyer », erreur), même quand elle est repliée sur téléphone
const etat = page => page.evaluate(() => (document.getElementById('sync-side') || {}).textContent || '');
// Répond aux boîtes de la page : reponses[i] pour la i-ème (true = OK), et garde leurs textes
function repondre(page, ...reponses) {
  const textes = [];
  page.__dialogue = d => { textes.push(d.message()); return reponses.length ? (reponses.shift() ? d.accept() : d.dismiss()) : d.accept(); };
  return textes;
}
// PC branché qui a envoyé ses données, puis téléphone neuf qui les a reçues : tous deux à la même Dernière synchro
async function deuxAppareils(depot, { stockageTel = {} } = {}) {
  const pc = await appareil(depot, base());
  const tel = await appareil(depot, null, { stockage: stockageTel, viewport: { width: 390, height: 800 }, touch: true });
  return { pc, tel };
}

test('une modification faite sur le PC arrive sur le téléphone', async () => {
  const depot = fauxDepot();
  const { pc, tel } = await deuxAppareils(depot);
  assert.equal(depot.versions.length, 1, 'le premier envoi du PC crée le fichier');
  assert.equal((await tel.db()).tasks.length, 3);
  await cocher(pc, 'a');
  await synchroniser(pc);
  assert.equal(tacheDe(depot.donnees(), 'a').status, 'done');
  await synchroniser(tel);
  assert.equal(tacheDe(await tel.db(), 'a').status, 'done');
  assert.doesNotMatch(await etat(tel), /à envoyer|⚠/);
  assert.deepEqual([...pc.errors, ...tel.errors], []);
});

test('un appareil neuf, branché par la carte Synchro, récupère les données avec le bandeau', async () => {
  const depot = fauxDepot();
  await appareil(depot, base());
  const tel = await appareil(depot, null, { cfg: null, hash: 'donnees', viewport: { width: 390, height: 800 }, touch: true });
  await tel.fill('#main #sync-form [name="repo"]', 'exemple/donnees-fictives');
  await tel.fill('#main #sync-form [name="token"]', 'jeton-fictif');
  await tel.click('#main #sync-form [type="submit"]');
  await tel.locator('#toast .toast', { hasText: 'Données récupérées depuis GitHub.' }).waitFor();
  assert.deepEqual((await tel.db()).tasks.map(t => t.title), ['Tâche A', 'Tâche B', 'Tâche C']);
  assert.equal(depot.versions.length, 1, 'rien n\'est renvoyé');
});

test('un appareil vide n\'envoie jamais rien, et un fichier GitHub illisible ne change rien ici', async () => {
  const depot = fauxDepot();
  const tel = await appareil(depot, null);
  assert.equal(depot.versions.length, 0);
  depot.pousser({ pas: 'une sauvegarde' });
  const pc = await appareil(depot, base());
  assert.match(await etat(pc), /le fichier sur GitHub est illisible, rien n'a été changé ici/);
  assert.equal((await pc.db()).tasks.length, 3);
  assert.equal(depot.versions.length, 1);
  assert.deepEqual(tel.errors, []);
});

test('Conflit de synchro : OK garde cet appareil et l\'envoie ; l\'autre version reste dans l\'historique du dépôt', async () => {
  const depot = fauxDepot();
  const { pc, tel } = await deuxAppareils(depot);
  await cocher(pc, 'a');
  await synchroniser(pc);
  const versionPc = depot.dernier().version;
  const textes = repondre(tel, true);
  await archiver(tel, 'b');
  await synchroniser(tel);
  assert.equal(textes.length, 1);
  assert.match(textes[0], /modifiées sur cet appareil ET sur un autre depuis la dernière synchro/);
  assert.match(textes[0], /GitHub \(.+\) : 1 sujets, 3 tâches/);
  assert.match(textes[0], /Cet appareil : 1 sujets, 3 tâches/);
  assert.match(textes[0], /OK = garder la version de cet appareil et l'envoyer sur GitHub/);
  assert.match(textes[0], /Annuler = garder la version de GitHub/);
  assert.match(textes[0], /« Revenir à l'état d'avant la dernière synchro reçue »/);
  const envoye = depot.donnees();
  assert.equal(tacheDe(envoye, 'b').archived, true);
  assert.equal(tacheDe(envoye, 'a').status, 'todo');
  assert.equal(tacheDe(depot.versions.find(v => v.version === versionPc).donnees, 'a').status, 'done', 'la version du PC reste dans l\'historique');
  await synchroniser(pc);
  assert.equal(tacheDe(await pc.db(), 'b').archived, true, 'le PC reçoit la version gardée');
});

test('Conflit de synchro : Annuler reçoit GitHub sans toucher au point « import », et le bouton de retour rend la version d\'avant', async () => {
  const depot = fauxDepot();
  const { pc, tel } = await deuxAppareils(depot, { stockageTel: POINT_IMPORT });
  assert.deepEqual(await pointImport(tel), [POINT_IMPORT[IMPORT_KEY], POINT_IMPORT[IMPORT_KEY + '-date']], 'appareil neuf : le point « import » est gardé');
  await cocher(pc, 'a');
  await synchroniser(pc);
  const textes = repondre(tel, false, true);
  await archiver(tel, 'b');
  await synchroniser(tel);
  assert.equal(textes.length, 1);
  const recu = await tel.db();
  assert.equal(tacheDe(recu, 'a').status, 'done');
  assert.equal(tacheDe(recu, 'b').archived, false);
  assert.deepEqual(await pointImport(tel), [POINT_IMPORT[IMPORT_KEY], POINT_IMPORT[IMPORT_KEY + '-date']], 'une version reçue ne change pas le point « import »');
  await tel.click('#main [data-act="sync-undo"]');
  assert.equal(tacheDe(await tel.db(), 'b').archived, true, 'la version de cet appareil est rendue');
});

test('GitHub vide alors que cet appareil a des données : OK renvoie cet appareil sur GitHub', async () => {
  const depot = fauxDepot();
  const { tel } = await deuxAppareils(depot);
  depot.pousser({ version: 1, subjects: [], tasks: [], settings: {} });
  const textes = repondre(tel, true);
  await synchroniser(tel);
  assert.equal(textes.length, 1);
  assert.match(textes[0], /Le fichier sur GitHub est vide, alors que cet appareil a 1 sujets et 3 tâches/);
  assert.match(textes[0], /OK = renvoyer les données de cet appareil sur GitHub/);
  assert.equal(depot.donnees().tasks.length, 3);
  assert.equal((await tel.db()).tasks.length, 3);
});

test('premier branchement d\'un appareil rempli : sa propre question, avec les nombres des deux côtés ; OK l\'envoie', async () => {
  const depot = fauxDepot(autre());
  const textes = [];
  const tel = await appareil(depot, base(), { dialogue: d => { textes.push(d.message()); d.accept(); } });
  assert.equal(textes.length, 1);
  assert.match(textes[0], /^Cet appareil a déjà des données, et GitHub aussi\. Laquelle garder \?/);
  assert.match(textes[0], /GitHub \(date inconnue\) : 2 sujets, 1 tâches/);
  assert.match(textes[0], /Cet appareil : 1 sujets, 3 tâches/);
  assert.match(textes[0], /OK = garder la version de cet appareil et l'envoyer sur GitHub/);
  assert.doesNotMatch(textes[0], /ET sur un autre/, 'ce n\'est pas un Conflit de synchro');
  assert.equal(depot.donnees().tasks.length, 3);
  assert.equal(depot.versions.length, 2, 'la version de GitHub reste dans l\'historique');
  assert.deepEqual(tel.errors, []);
});

test('premier branchement d\'un appareil rempli : Annuler reçoit GitHub', async () => {
  const depot = fauxDepot(autre());
  const tel = await appareil(depot, base(), { dialogue: d => d.dismiss() });
  assert.deepEqual((await tel.db()).tasks.map(t => t.title), ['Tâche X']);
  assert.equal(depot.versions.length, 1);
});

test('premier branchement avec les mêmes données que GitHub : aucune question, et rien n\'est à envoyer', async () => {
  const depot = fauxDepot();
  await appareil(depot, base());
  const textes = [];
  const tel = await appareil(depot, base(), { dialogue: d => { textes.push(d.message()); d.accept(); } });
  assert.deepEqual(textes, []);
  assert.equal(depot.versions.length, 1);
  assert.match(await etat(tel), /☁ Synchro · \d\d:\d\d$/);
});

test('une modification faite pendant un envoi part juste après', async () => {
  const depot = fauxDepot();
  const { pc } = await deuxAppareils(depot);
  await cocher(pc, 'a');
  // Pendant l'envoi de « A faite », on archive B sur le même appareil
  depot.avantEcriture = () => archiver(pc, 'b');
  await synchroniser(pc);
  await pc.waitForFunction(() => !/à envoyer/.test(document.getElementById('sync-side').textContent), null, { timeout: 8000 });
  await synchroFinie(pc);
  const fin = depot.donnees();
  assert.equal(tacheDe(fin, 'a').status, 'done');
  assert.equal(tacheDe(fin, 'b').archived, true, 'la modification faite pendant l\'envoi est partie');
});

test('conflit d\'écriture (l\'autre appareil écrit entre la lecture et l\'écriture) : nouvelle tentative, rien n\'est perdu', async () => {
  const depot = fauxDepot();
  const { pc } = await deuxAppareils(depot);
  await cocher(pc, 'a');
  depot.avantEcriture = () => {
    // Le téléphone écrit sa version (C faite) pendant que le PC envoie la sienne
    const d = depot.donnees();
    tacheDe(d, 'c').status = 'done';
    depot.pousser(d);
  };
  const textes = repondre(pc, true);
  await synchroniser(pc);
  assert.equal(textes.length, 1, 'après relecture, les deux côtés ont changé : on demande');
  assert.doesNotMatch(await etat(pc), /⚠/);
  const fin = depot.donnees();
  assert.equal(tacheDe(fin, 'a').status, 'done', 'la version du PC est partie');
  assert.ok(depot.versions.some(v => tacheDe(v.donnees, 'c').status === 'done'), 'la version du téléphone reste dans l\'historique');
});

test('un dépôt public est refusé, l\'erreur s\'affiche et rien ne part', async () => {
  const depot = fauxDepot();
  depot.prive = false;
  const pc = await appareil(depot, base());
  assert.match(await etat(pc), /⚠ Synchro : le dépôt exemple\/donnees-fictives est public/);
  assert.equal(depot.versions.length, 0);
  assert.equal(depot.lectures, 0);
});

test('l\'historique d\'annulation se vide quand une version arrive', async () => {
  const depot = fauxDepot();
  const { pc, tel } = await deuxAppareils(depot);
  await cocher(tel, 'c');
  await synchroniser(tel);
  await synchroniser(pc);
  await cocher(pc, 'a');
  await synchroniser(pc);
  await synchroniser(tel);
  assert.equal(tacheDe(await tel.db(), 'a').status, 'done');
  await ailleurs(tel);
  await ctrl(tel, 'z');
  assert.match(await tel.locator('#toast').innerText(), /Rien à annuler/);
  assert.equal(tacheDe(await tel.db(), 'c').status, 'done');
});

test('le mode démo ne synchronise rien', async () => {
  const depot = fauxDepot(base());
  const page = await appareil(depot, null, { query: '?demo' });
  await page.waitForTimeout(300);
  assert.equal(depot.lectures, 0);
  assert.equal(await etat(page), '');
  assert.deepEqual(page.errors, []);
});
