const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, closeAll, day } = require('./helpers');
after(closeAll);

/* ---------- Task 2 : sous-sujets dans l'onglet Sujets ---------- */
const nest = (extra = {}) => Object.assign({
  version: 1,
  subjects: [
    { id: 'p', title: 'Achat machine', priority: 1 },
    { id: 'c', title: 'CDC', priority: 1, parentId: 'p' },
    { id: 'o', title: 'Autre sujet', priority: 2 }
  ],
  tasks: [
    { id: 't1', subjectId: 'p', title: 'Appeler le fournisseur', deadline: day(0), status: 'done' },
    { id: 't2', subjectId: 'c', title: 'Rédiger cahier', deadline: day(2), notes: 'v1' }
  ],
  settings: {}, ui: { expanded: ['p'] }
}, extra);
const box = (page, id) => page.locator(`.subject[data-sid="${id}"]`).first();

test('un sous-sujet s\'affiche replié sous son parent, et le parent compte ses tâches', async () => {
  const page = await openApp(nest(), { hash: 'sujets' });
  assert.equal(await page.locator('#main > .prio-group > .subject[data-sid="c"]').count(), 0);
  const child = page.locator('.subject[data-sid="p"] .s-children .subject.child[data-sid="c"]');
  assert.equal(await child.count(), 1);
  assert.equal(await child.locator('.s-body').count(), 0);
  assert.match(await box(page, 'p').locator('> .s-head').innerText(), /1\/2/);
  assert.deepEqual(page.errors, []);
});

test('« Dans » range un sujet sous un autre ; absent sur un parent', async () => {
  const page = await openApp(nest({ ui: { expanded: ['p', 'o'] } }), { hash: 'sujets' });
  assert.equal(await box(page, 'p').locator('> .s-body > .s-dims [data-field="s-parent"]').count(), 0);
  await box(page, 'o').locator('[data-field="s-parent"]').selectOption('p');
  await page.waitForTimeout(50);
  const d = await page.db();
  assert.equal(d.subjects.find(s => s.id === 'o').parentId, 'p');
  assert.equal(await page.locator('.subject[data-sid="p"] .s-children .subject[data-sid="o"]').count(), 1);
});

test('« + Sous-sujet » crée un sous-sujet ouvert', async () => {
  const page = await openApp(nest(), { hash: 'sujets' });
  await box(page, 'p').locator('[data-act="add-child"]').click();
  const d = await page.db();
  const n = d.subjects.find(s => s.parentId === 'p' && s.id !== 'c');
  assert.ok(n);
  assert.equal(n.priority, 1);
  assert.ok(d.ui.expanded.includes(n.id));
});

test('archiver un parent cache ses sous-sujets, restaurer les rend', async () => {
  const page = await openApp(nest(), { hash: 'sujets' });
  await box(page, 'p').locator('> .s-head [data-act="archive-subject"]').click();
  let d = await page.db();
  assert.equal(d.subjects.find(s => s.id === 'c').archived, true);
  await page.evaluate(() => { location.hash = 'dashboard'; });
  assert.doesNotMatch(await page.locator('#main').innerText(), /Rédiger cahier/);
  await page.evaluate(() => { location.hash = 'archives'; });
  await page.locator('.task[data-sid="p"] [data-act="restore-subject"]').click();
  d = await page.db();
  assert.equal(d.subjects.find(s => s.id === 'c').archived, false);
});

test('la recherche d\'une tâche d\'un sous-sujet ouvre le parent et le sous-sujet', async () => {
  const page = await openApp(nest({ ui: { expanded: [] } }), { hash: 'sujets' });
  await page.fill('#search', 'cahier');
  await page.waitForTimeout(50);
  assert.equal(await page.locator('.subject[data-sid="c"] .task[data-tid="t2"]').count(), 1);
  assert.equal(await page.locator('.subject[data-sid="o"]').count(), 0);
});

test('les sous-sujets sont listés « ↳ » sous leur parent', async () => {
  const page = await openApp(nest({ tasks: [{ id: 'x', title: 'Boîte', subjectId: null }] }), { hash: 'inbox' });
  const opts = await page.locator('.task[data-tid="x"] [data-field="subjectId"] option').allInnerTexts();
  const i = opts.findIndex(o => o.includes('Achat machine'));
  assert.match(opts[i + 1], /↳ CDC/);
});

/* ---------- Task 3 : transformer une tâche en sous-sujet ---------- */
async function convert(page, tid) {
  await page.locator(`.task[data-tid="${tid}"] [data-act="details"]`).first().click();
  await page.locator('.drawer [data-act="to-subject"]').click();
  return page.db();
}
test('une tâche d\'un sujet devient un sous-sujet qui la contient', async () => {
  const page = await openApp(nest({ tasks: [{ id: 'k', subjectId: 'p', title: 'Préparer FAT', deadline: day(3), notes: 'n', status: 'doing', progress: 30 }] }), { hash: 'sujets' });
  const d = await convert(page, 'k');
  const s = d.subjects.find(x => x.title === 'Préparer FAT');
  assert.equal(s.parentId, 'p');
  const t = d.tasks.find(x => x.id === 'k');
  assert.equal(t.subjectId, s.id);
  assert.equal(t.deadline, day(3));
  assert.equal(t.notes, 'n');
  assert.equal(t.status, 'doing');
  assert.deepEqual(page.errors, []);
});
test('une tâche d\'un sous-sujet devient un sous-sujet frère', async () => {
  const page = await openApp(nest({ ui: { expanded: ['p', 'c'] } }), { hash: 'sujets' });
  const d = await convert(page, 't2');
  const s = d.subjects.find(x => x.title === 'Rédiger cahier');
  assert.equal(s.parentId, 'p');
});
test('une tâche de la boîte de réception devient un sujet', async () => {
  const page = await openApp(nest({ tasks: [{ id: 'x', title: 'Idée', subjectId: null }] }), { hash: 'inbox' });
  const d = await convert(page, 'x');
  const s = d.subjects.find(x => x.title === 'Idée');
  assert.ok(s && !s.parentId);
  assert.equal(d.tasks.find(x => x.id === 'x').subjectId, s.id);
});

/* ---------- Task 4 : mode projet sur un sujet ---------- */
test('« Mode projet » sur un sujet le fait apparaître dans Projets, ses sous-sujets en étapes', async () => {
  const page = await openApp(nest({ settings: { modules: { projet: true } }, ui: { expanded: ['p', 'c'] } }), { hash: 'sujets' });
  assert.equal(await box(page, 'c').locator('[data-pjf="is-project"]').count(), 0);   // pas sur un sous-sujet
  await box(page, 'p').locator('> .s-body [data-pjf="is-project"]').click();
  let d = await page.db();
  assert.equal(d.subjects.find(s => s.id === 'p').isProject, true);
  assert.equal(await box(page, 'c').locator('[data-pjf="dur"]').count(), 1);   // champs d'étape sur le sous-sujet
  await box(page, 'p').locator('[data-pj="open-project"]').click();
  await page.waitForFunction(() => location.hash === '#projets');
  assert.match(await page.locator('#main h1').innerText(), /Achat machine/);
  assert.match(await page.locator('.pj-unplanned').innerText(), /CDC/);
  // Avancement global : la tâche faite du niveau 1 compte
  await page.click('[data-pj="back"]');
  assert.match(await page.locator('.pj-card').innerText(), /50%/);
  assert.deepEqual(page.errors, []);
});
