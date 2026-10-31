// Point unique de modification : historique, Ctrl+Z / Ctrl+Y, boutons ↶ ↷, bandeau et retour à l'endroit (ticket #26)
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, closeAll, day } = require('./helpers');
after(closeAll);

const VIEUX = '2000-01-01T00:00:00.000Z';
const base = (extra = {}) => Object.assign({
  version: 1,
  subjects: [{ id: 'p', title: 'Sujet P', priority: 1, updatedAt: VIEUX }, { id: 'q', title: 'Sujet Q', priority: 2, updatedAt: VIEUX }],
  tasks: [
    { id: 'a', subjectId: 'p', title: 'Tâche A', deadline: day(0), updatedAt: VIEUX },
    { id: 'b', subjectId: 'p', title: 'Tâche B', deadline: day(0), updatedAt: VIEUX },
    { id: 'c', subjectId: 'q', title: 'Tâche C', deadline: day(1), updatedAt: VIEUX }],
  settings: { modules: {} }, ui: { expanded: ['p', 'q'] }
}, extra);
const tache = async (page, id) => (await page.db()).tasks.find(t => t.id === id);
const ligne = (page, id) => page.locator(`#main .task[data-tid="${id}"]`).first();
const ctrl = (page, k) => page.keyboard.press('Control+' + k);
const boutons = page => page.evaluate(() => [...document.querySelectorAll('#hist .hist-b')].map(b => ({ act: b.dataset.act, off: b.disabled, t: b.title })));

test('Ctrl+Z annule la dernière modification, Ctrl+Y et Ctrl+Maj+Z la rétablissent, avec bandeau', async () => {
  const page = await openApp(base());
  await ligne(page, 'a').locator('[data-act="archive-task"]').click();
  assert.equal((await tache(page, 'a')).archived, true);
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await ctrl(page, 'z');
  assert.equal((await tache(page, 'a')).archived, false);
  assert.match(await page.locator('#toast').innerText(), /Annulé : Tâche archivée : « Tâche A »/);
  assert.match(await page.locator('#toast button').innerText(), /Rétablir/);
  await ctrl(page, 'y');
  assert.equal((await tache(page, 'a')).archived, true);
  assert.match(await page.locator('#toast').innerText(), /Rétabli : Tâche archivée/);
  await ctrl(page, 'z');
  await ctrl(page, 'Shift+Z');
  assert.equal((await tache(page, 'a')).archived, true);
  await ctrl(page, 'z');
  await page.click('#toast [data-act="undo"]');   // « Rétablir » du bandeau
  assert.equal((await tache(page, 'a')).archived, true);
  assert.deepEqual(page.errors, []);
});

test('plusieurs Ctrl+Z remontent l\'historique ; une nouvelle modification vide ce qui pouvait être rétabli', async () => {
  const page = await openApp(base());
  await ligne(page, 'a').locator('[data-act="toggle-done"]').click();
  await ligne(page, 'b').locator('[data-act="archive-task"]').click();
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await ctrl(page, 'z'); await ctrl(page, 'z');
  assert.equal((await tache(page, 'a')).status, 'todo');
  assert.equal((await tache(page, 'b')).archived, false);
  await ligne(page, 'c').locator('[data-act="archive-task"]').click();
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await ctrl(page, 'y');
  assert.equal((await tache(page, 'a')).status, 'todo', 'rien à rétablir après une nouvelle modification');
  assert.match(await page.locator('#toast').innerText(), /Rien à rétablir/);
});

test('Ctrl+Z pendant la frappe dans un champ ne défait que la frappe', async () => {
  const page = await openApp(base());
  await ligne(page, 'a').locator('[data-act="archive-task"]').click();
  await page.fill('#qa-title', 'abc');
  await page.focus('#qa-title');
  await ctrl(page, 'z');
  assert.equal((await tache(page, 'a')).archived, true, 'la modification de l\'appli n\'est pas annulée');
});

test('boutons ↶ ↷ : grisés sans historique, info-bulle qui dit ce qu\'ils font, un champ validé = un pas', async () => {
  const page = await openApp(base(), { hash: 'sujets' });
  assert.deepEqual((await boutons(page)).map(b => b.off), [true, true]);
  const titre = ligne(page, 'a').locator('[data-field="title"]');
  await titre.fill('Tâche A bis');
  await titre.press('Enter');
  await page.waitForTimeout(50);
  const [u, r] = await boutons(page);
  assert.equal(u.off, false);
  assert.equal(u.t, 'Annuler : Titre : « Tâche A bis »');
  assert.equal(r.off, true);
  await page.click('#hist [data-act="hist-undo"]');
  assert.equal((await tache(page, 'a')).title, 'Tâche A');
  const [u2, r2] = await boutons(page);
  assert.equal(u2.off, true);
  assert.equal(r2.t, 'Rétablir : Titre : « Tâche A bis »');
  await page.click('#hist [data-act="hist-redo"]');
  assert.equal((await tache(page, 'a')).title, 'Tâche A bis');
});

test('date « modifiée le » posée seulement sur ce qui a changé, et remise par Ctrl+Z', async () => {
  const page = await openApp(base());
  await ligne(page, 'a').locator('[data-act="postpone"]').click();
  const d = await page.db();
  assert.notEqual(d.tasks.find(t => t.id === 'a').updatedAt, VIEUX);
  assert.equal(d.tasks.find(t => t.id === 'b').updatedAt, VIEUX);
  assert.equal(d.subjects.find(s => s.id === 'p').updatedAt, VIEUX);
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await ctrl(page, 'z');
  assert.equal((await tache(page, 'a')).updatedAt, VIEUX);
});

test('annuler ne touche pas l\'affichage ni le thème', async () => {
  const page = await openApp(base(), { hash: 'sujets' });
  await ligne(page, 'a').locator('[data-act="archive-task"]').click();
  await page.click('.subject[data-sid="q"] [data-act="toggle-subject"]');
  await page.click('[data-act="theme"][data-v="dark"]');
  await ctrl(page, 'z');
  const d = await page.db();
  assert.equal(d.tasks.find(t => t.id === 'a').archived, false);
  assert.deepEqual(d.ui.expanded, ['p']);
  assert.equal(d.settings.theme, 'dark');
});

test('après Ctrl+Z, retour à l\'écran de la modification, sujet déplié et ligne en surbrillance', async () => {
  const page = await openApp(base(), { hash: 'sujets' });
  await page.locator('.subject[data-sid="q"] .task[data-tid="c"] [data-act="postpone"]').click();
  await page.click('.subject[data-sid="q"] [data-act="toggle-subject"]');   // on replie le sujet
  await page.goto(page.url().replace(/#.*$/, '#dashboard'));
  await page.waitForTimeout(50);
  assert.match(page.url(), /#dashboard/);
  await ctrl(page, 'z');
  await page.waitForTimeout(80);
  assert.match(page.url(), /#sujets/);
  assert.equal((await tache(page, 'c')).deadline, day(1));
  assert.equal(await page.locator('.subject[data-sid="q"] .task[data-tid="c"].flash').count(), 1);
});

test('le bandeau « Annuler » d\'une modification utilise l\'historique ; il disparaît après une autre modification', async () => {
  const page = await openApp(base());
  await ligne(page, 'a').locator('[data-act="archive-task"]').click();
  await page.click('#toast [data-act="undo"]');
  assert.equal((await tache(page, 'a')).archived, false);
  assert.match(await page.locator('#toast').innerText(), /Annulé/);
  await ligne(page, 'b').locator('[data-act="archive-task"]').click();
  await ligne(page, 'c').locator('[data-field="title"]').fill('C2');
  await ligne(page, 'c').locator('[data-field="title"]').press('Enter');
  await page.waitForTimeout(50);
  assert.equal(await page.locator('#toast [data-act="undo"]').count(), 0);
});

test('l\'historique se vide quand des données arrivent d\'ailleurs (synchro, autre onglet)', async () => {
  const page = await openApp(base());
  await ligne(page, 'a').locator('[data-act="archive-task"]').click();
  await page.evaluate(() => window.todoApp.replaceData(window.todoApp.getData()));
  assert.equal(await page.locator('#toast [data-act="undo"]').count(), 0);
  assert.deepEqual((await boutons(page)).map(b => b.off), [true, true]);
  await ligne(page, 'b').locator('[data-act="archive-task"]').click();
  await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'todo-noel-v1' })));
  assert.deepEqual((await boutons(page)).map(b => b.off), [true, true]);
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await ctrl(page, 'z');
  assert.equal((await tache(page, 'b')).archived, true);
});

test('50 pas au plus ; un import (données complètes) compte pour un seul pas', async () => {
  const page = await openApp(base());
  const n = await page.evaluate(() => {
    const A = window.todoApp;
    for (let i = 0; i < 55; i++) A.modifier('Titre ' + i, d => { d.tasks[0].title = 'T' + i; });
    A.modifier('Import', d => Object.assign({}, d, { tasks: d.tasks.concat([{ title: 'Importée 1' }, { title: 'Importée 2' }]) }));
    return A.getData().tasks.length;
  });
  assert.equal(n, 5);
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await ctrl(page, 'z');
  assert.equal((await page.db()).tasks.length, 3, 'un Ctrl+Z défait tout l\'import');
  for (let i = 0; i < 60; i++) await page.evaluate(() => window.todoApp.annuler());
  assert.equal((await tache(page, 'a')).title, 'T5', 'les 5 plus anciennes ne sont plus annulables');
});

test('annuler la transformation d\'une tâche en sujet retire le sujet créé et revient à la tâche', async () => {
  const page = await openApp(base());
  await ligne(page, 'a').locator('[data-act="details"]').click();
  await page.click('.drawer [data-act="to-subject"]');
  await page.waitForTimeout(50);
  assert.equal((await page.db()).subjects.length, 3);
  await ctrl(page, 'z');
  await page.waitForTimeout(80);
  const d = await page.db();
  assert.equal(d.subjects.length, 2);
  assert.equal(d.tasks.find(t => t.id === 'a').subjectId, 'p');
  assert.match(page.url(), /#dashboard|index\.html$/);
});

test('mode démo, modules coupés, téléphone : Ctrl+Z et boutons ↶ ↷ marchent', async () => {
  const page = await openApp(null, { query: '?demo' });
  const id = await page.locator('#main .task').first().getAttribute('data-tid');
  await ligne(page, id).locator('[data-act="archive-task"]').click();
  await ctrl(page, 'z');
  assert.equal((await tache(page, id)).archived, false);

  const off = { chrono: false, charge: false, pointage: false, recurrence: false, projet: false };
  const tel = await openApp(base({ settings: { modules: off } }), { viewport: { width: 390, height: 800 }, touch: true });
  await ligne(tel, 'a').locator('[data-act="archive-task"]').click();
  const b = tel.locator('#hist [data-act="hist-undo"]');
  assert.equal(await b.isVisible(), true);
  const box = await b.boundingBox();
  assert.ok(box.height >= 44 && box.width >= 40, 'cible tactile assez grande');
  await b.click();
  assert.equal((await tache(tel, 'a')).archived, false);
  assert.equal(await tel.evaluate(() => document.documentElement.scrollWidth), 390);
  assert.deepEqual(tel.errors, []);
});

// Corrections issues de la revue de la PR #29 (chacune d'abord en échec)
test('une donnée changée hors du point unique (filet de sécurité) vide l\'historique : Ctrl+Z ne l\'efface jamais', async () => {
  const page = await openApp(base());
  await ligne(page, 'a').locator('[data-act="archive-task"]').click();
  await page.evaluate(() => { const A = window.todoApp; A.getData().tasks.find(t => t.id === 'b').title = 'Changée ailleurs'; A.enregistrerAffichage(); });
  assert.equal(await page.locator('#toast [data-act="undo"]').count(), 0, 'le bandeau « Annuler » de l\'archivage est retiré');
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await ctrl(page, 'z');
  assert.equal((await tache(page, 'b')).title, 'Changée ailleurs', 'la modification directe est toujours là');
  assert.equal((await tache(page, 'a')).archived, true);
});

test('une validation sans changement ne crée pas de pas dans l\'historique', async () => {
  const page = await openApp(base({ tasks: [{ id: 'a', subjectId: 'p', title: 'Tâche A', deadline: day(0), estimateMin: 90, updatedAt: VIEUX }] }), { hash: 'sujets' });
  const est = ligne(page, 'a').locator('[data-field="estimate"]');
  await est.fill('90min');
  await est.press('Enter');
  await page.waitForTimeout(50);
  assert.deepEqual((await boutons(page)).map(b => b.off), [true, true]);
  assert.equal((await tache(page, 'a')).updatedAt, VIEUX, 'date « modifiée le » inchangée');
});

test('Ctrl+Z dans un champ date n\'annule pas la modification de l\'appli', async () => {
  const page = await openApp(base());
  await ligne(page, 'a').locator('[data-act="archive-task"]').click();
  await page.focus('#qa-date');
  await ctrl(page, 'z');
  assert.equal((await tache(page, 'a')).archived, true);
});

test('Fait sur une tâche récurrente puis Ctrl+Z : la tâche rouverte et l\'occurrence suivante retirée', async () => {
  const page = await openApp(base({ tasks: [{ id: 'a', subjectId: 'p', title: 'Hebdo', deadline: day(0), recur: { freq: 'week', interval: 1 } }] }));
  await ligne(page, 'a').locator('[data-act="toggle-done"]').click();
  await page.waitForTimeout(50);
  assert.equal((await page.db()).tasks.length, 2, 'occurrence suivante créée');
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await ctrl(page, 'z');
  const d = await page.db();
  assert.equal(d.tasks.length, 1);
  assert.equal(d.tasks[0].status, 'todo');
  await ctrl(page, 'y');
  assert.equal((await page.db()).tasks.length, 2, 'Rétablir remet la tâche faite et son occurrence');
});

test('import JSON, retour à l\'état d\'avant et démo remise à zéro vident l\'historique', async () => {
  const page = await openApp(base(), { hash: 'donnees' });
  const vide = async () => assert.deepEqual((await boutons(page)).map(b => b.off), [true, true]);
  const archiver = () => page.evaluate(() => window.todoApp.modifier('Test', d => { d.tasks[0].archived = !d.tasks[0].archived; }));
  await archiver();
  await page.setInputFiles('#file', { name: 's.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(base())) });
  await page.waitForTimeout(100);
  await vide();
  await archiver();
  await page.click('[data-act="undo-import"]');
  await page.waitForTimeout(50);
  await vide();
  const demo = await openApp(null, { query: '?demo', hash: 'donnees' });
  await demo.evaluate(() => window.todoApp.modifier('Test', d => { d.tasks[0].archived = true; }));
  await demo.click('#demo-bar [data-act="demo-reset"]');
  await demo.waitForTimeout(50);
  assert.deepEqual((await boutons(demo)).map(b => b.off), [true, true]);
});

test('après Rétablir, retour à l\'endroit de la modification avec surbrillance', async () => {
  const page = await openApp(base(), { hash: 'sujets' });
  await page.locator('.subject[data-sid="q"] .task[data-tid="c"] [data-act="postpone"]').click();
  await ctrl(page, 'z');
  await page.goto(page.url().replace(/#.*$/, '#dashboard'));
  await page.waitForTimeout(50);
  await ctrl(page, 'y');
  await page.waitForTimeout(80);
  assert.match(page.url(), /#sujets/);
  assert.equal(await page.locator('.subject[data-sid="q"] .task[data-tid="c"].flash').count(), 1);
});
