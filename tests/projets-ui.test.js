const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, closeAll } = require('./helpers');
after(closeAll);

const data = (on, extra = {}) => Object.assign({
  version: 1,
  subjects: [{ id: 's1', title: 'CDC machine', priority: 1 }, { id: 's2', title: 'FAT', priority: 2 }],
  tasks: [{ id: 't1', subjectId: 's1', title: 'Envoyer email', deadline: null }],
  projects: [{ id: 'p1', name: 'Achat machine', owner: 'Noel', color: '#4f63e8', order: 0, archived: false, createdAt: '2026-10-01T00:00:00Z', milestones: [] }],
  settings: { modules: on ? { projet: true } : {} }, ui: {}
}, extra);

/* ---------- Task 2 : module, données, liste ---------- */
test('module désactivé par défaut : pas d\'onglet, #projets retombe sur le tableau de bord', async () => {
  const page = await openApp(data(false), { hash: 'projets' });
  assert.equal(await page.locator('#nav a[href="#projets"]').count(), 0);
  assert.match(await page.locator('#main h1').innerText(), /Tableau de bord/);
  assert.deepEqual(page.errors, []);
});

test('module désactivé : les données projet survivent à une sauvegarde', async () => {
  const page = await openApp(data(false, { subjects: [{ id: 's1', title: 'CDC', priority: 1, projectId: 'p1', plan: { start: '2026-11-02', durDays: 3 } }] }), { hash: 'sujets' });
  await page.evaluate(() => { window.todoApp.getData().tasks[0].title = 'modifié'; window.todoApp.save(); });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('todo-noel-v1')));
  assert.equal(saved.projects[0].name, 'Achat machine');
  assert.equal(saved.subjects[0].projectId, 'p1');
  assert.equal(saved.subjects[0].plan.durDays, 3);
});

test('module actif : onglet Projets, liste, création et archivage', async () => {
  const page = await openApp(data(true), { hash: 'projets' });
  assert.equal(await page.locator('#nav a[href="#projets"]').count(), 1);
  assert.match(await page.locator('#main').innerText(), /Achat machine/);
  page.__prompt = 'Ligne 2';
  await page.click('[data-pj="new-project"]');
  let d = await page.db();
  assert.ok(d.projects.some(p => p.name === 'Ligne 2' && !p.archived && Array.isArray(p.milestones)));
  await page.click('.pj-card[data-pid="p1"] [data-pj="archive-project"]');
  d = await page.db();
  assert.equal(d.projects.find(p => p.id === 'p1').archived, true);
  assert.doesNotMatch(await page.locator('#main').innerText(), /Achat machine/);
  assert.deepEqual(page.errors, []);
});

/* ---------- Task 3 : étapes ---------- */
const sujets = (d) => Object.assign(d, { ui: { expanded: ['s1', 's2'] } });

test('module désactivé : pas de champ Projet dans le sujet', async () => {
  const page = await openApp(sujets(data(false)), { hash: 'sujets' });
  assert.equal(await page.locator('[data-pjf="project"]').count(), 0);
});

test('rattacher un sujet, régler durée, début et lien « Après »', async () => {
  const page = await openApp(sujets(data(true)), { hash: 'sujets' });
  const box = id => page.locator(`.subject[data-sid="${id}"]`);
  await box('s1').locator('[data-pjf="project"]').selectOption('p1');
  await box('s2').locator('[data-pjf="project"]').selectOption('p1');
  await box('s1').locator('[data-pjf="start"]').fill('2026-11-02');
  await box('s1').locator('[data-pjf="start"]').dispatchEvent('change');
  await box('s1').locator('[data-pjf="dur"]').fill('5');
  await box('s1').locator('[data-pjf="dur"]').dispatchEvent('change');
  await box('s2').locator('[data-pjf="dur"]').fill('3');
  await box('s2').locator('[data-pjf="dur"]').dispatchEvent('change');
  await box('s2').locator('[data-pj-after="s1"]').check();
  await box('s2').locator('[data-pjf="who"]').fill('Entreprise A');
  await box('s2').locator('[data-pjf="who"]').dispatchEvent('change');
  const d = await page.db();
  const s1 = d.subjects.find(s => s.id === 's1'), s2 = d.subjects.find(s => s.id === 's2');
  assert.equal(s1.projectId, 'p1');
  assert.deepEqual(s1.plan, { start: '2026-11-02', durDays: 5 });
  assert.deepEqual(s2.after, ['s1']);
  assert.equal(s2.who, 'Entreprise A');
  assert.match(await box('s2').innerText(), /calculé/i);
  assert.equal(await box('s2').locator('[data-pjf="start"]').count(), 0);
  assert.deepEqual(page.errors, []);
});

test('un lien en boucle est refusé', async () => {
  const d0 = sujets(data(true, { subjects: [
    { id: 's1', title: 'A', priority: 1, projectId: 'p1', plan: { start: '2026-11-02', durDays: 2 } },
    { id: 's2', title: 'B', priority: 1, projectId: 'p1', plan: { durDays: 2 }, after: ['s1'] }] }));
  const page = await openApp(d0, { hash: 'sujets' });
  await page.locator('.subject[data-sid="s1"] [data-pj-after="s2"]').click();
  const d = await page.db();
  assert.deepEqual(d.subjects.find(s => s.id === 's1').after || [], []);
  assert.match(await page.locator('#toast, .toast').first().innerText(), /boucle/);
  assert.equal(await page.locator('.subject[data-sid="s1"] [data-pj-after="s2"]').isChecked(), false);
});

test('détacher une étape nettoie liens et jalons', async () => {
  const d0 = sujets(data(true, { subjects: [
    { id: 's1', title: 'A', priority: 1, projectId: 'p1', plan: { start: '2026-11-02', durDays: 2 }, who: 'X' },
    { id: 's2', title: 'B', priority: 1, projectId: 'p1', plan: { durDays: 2 }, after: ['s1'] }] }));
  d0.projects[0].milestones = [{ id: 'm1', name: 'Livraison', date: '2026-12-01', before: ['s1', 's2'] }];
  const page = await openApp(d0, { hash: 'sujets' });
  await page.locator('.subject[data-sid="s1"] [data-pjf="project"]').selectOption('');
  const d = await page.db();
  const s1 = d.subjects.find(s => s.id === 's1');
  assert.equal(s1.projectId || null, null);
  assert.deepEqual(d.subjects.find(s => s.id === 's2').after, []);
  assert.deepEqual(d.projects[0].milestones[0].before, ['s2']);
  assert.equal(s1.title, 'A');
});

test('« Nouvelle étape » crée un sujet rattaché et l\'ouvre', async () => {
  const d0 = data(true); d0.ui = { pjOpen: 'p1' };
  const page = await openApp(d0, { hash: 'projets' });
  page.__prompt = 'Déchargement';
  await page.click('[data-pj="new-step"]');
  await page.waitForFunction(() => location.hash === '#sujets');
  const d = await page.db();
  const s = d.subjects.find(x => x.title === 'Déchargement');
  assert.equal(s.projectId, 'p1');
  assert.ok(d.ui.expanded.includes(s.id));
});
