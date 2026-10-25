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
