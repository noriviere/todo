// Corrections issues de la relecture de la branche sous-sujets (chacune d'abord en échec)
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, closeAll, day } = require('./helpers');
after(closeAll);

const base = (subjects, tasks = [], extra = {}) => Object.assign({ version: 1, subjects, tasks, settings: { modules: { projet: true } }, ui: {} }, extra);

test('filtre Code sur le tableau de bord : une tâche du parent ne passe pas grâce à son sous-sujet', async () => {
  const page = await openApp(base([{ id: 'p', title: 'P', priority: 1, code: 'A' }, { id: 'c', title: 'C', priority: 1, code: 'B', parentId: 'p' }],
    [{ id: 'tp', subjectId: 'p', title: 'Tâche parent', deadline: day(0) }, { id: 'tc', subjectId: 'c', title: 'Tâche enfant', deadline: day(0) }],
    { ui: { dims: { code: 'B' } } }));
  assert.equal(await page.locator('#main .task[data-tid="tc"]').count(), 1);
  assert.equal(await page.locator('#main .task[data-tid="tp"]').count(), 0);
});

test('« Dans » masqué pour un sujet qui a des sous-sujets archivés', async () => {
  const page = await openApp(base([{ id: 'p', title: 'P', priority: 1 }, { id: 'c', title: 'C', priority: 1, parentId: 'p', archived: true }, { id: 'o', title: 'O', priority: 1 }],
    [], { ui: { expanded: ['p'] } }), { hash: 'sujets' });
  assert.equal(await page.locator('#main .subject[data-sid="p"] [data-field="s-parent"]').count(), 0);
});

test('ranger un sujet dans un parent replié l\'affiche déplié ; un projet ne se range pas', async () => {
  const page = await openApp(base([{ id: 'p', title: 'P', priority: 1 }, { id: 'o', title: 'O', priority: 1 },
    { id: 'q', title: 'Q', priority: 1, isProject: true, pj: { milestones: [] } }], [], { ui: { expanded: ['o', 'q'] } }), { hash: 'sujets' });
  await page.locator('#main .subject[data-sid="o"] [data-field="s-parent"]').selectOption('p');
  await page.waitForTimeout(50);
  assert.equal(await page.locator('#main .subject[data-sid="p"] .subject[data-sid="o"]').count(), 1);
  assert.equal(await page.locator('#main .subject[data-sid="q"] [data-field="s-parent"]').count(), 0);
});

test('parent archivé : la transformation crée un sujet de premier niveau, pas d\'étape d\'un projet archivé', async () => {
  const page = await openApp(base([{ id: 'p', title: 'P', priority: 1, archived: true, isProject: true, pj: { milestones: [] } },
    { id: 'c', title: 'C', priority: 1, parentId: 'p', plan: {} }], [{ id: 't', subjectId: 'c', title: 'Tâche' }], { ui: { expanded: ['c'] } }), { hash: 'sujets' });
  assert.equal(await page.locator('#main .subject[data-sid="c"] [data-pjf="dur"]').count(), 0);
  await page.click('#main .task[data-tid="t"] [data-act="details"]');
  await page.click('#drawer [data-act="to-subject"]');
  const d = await page.db();
  assert.equal(d.subjects.find(s => s.title === 'Tâche').parentId || null, null);
});

test('annuler une transformation ne laisse pas de sujet fantôme', async () => {
  const page = await openApp(base([{ id: 'p', title: 'P', priority: 1 }], [{ id: 't', subjectId: 'p', title: 'Tâche' }], { ui: { expanded: ['p'] } }), { hash: 'sujets' });
  await page.click('#main .task[data-tid="t"] [data-act="details"]');
  await page.click('#drawer [data-act="to-subject"]');
  await page.click('#toast [data-act="undo"]');
  const d = await page.db();
  assert.equal(d.subjects.length, 1);
  assert.equal(d.tasks[0].subjectId, 'p');
});

test('un projet archivé ne s\'ouvre plus dans Projets', async () => {
  const page = await openApp(base([{ id: 'p', title: 'Projet X', priority: 1, archived: true, isProject: true, pj: { milestones: [] } }], [], { ui: { pjOpen: 'p' } }), { hash: 'projets' });
  assert.match(await page.locator('#main h1').innerText(), /^Projets/);
});

test('la carte d\'un projet permet de quitter le mode projet', async () => {
  const page = await openApp(base([{ id: 'p', title: 'Projet X', priority: 1, isProject: true, pj: { milestones: [] } }]), { hash: 'projets' });
  await page.click('#main .pj-card[data-pid="p"] [data-pj="unproject"]');
  assert.equal((await page.db()).subjects[0].isProject, false);
});

test('migration : une étape qui a ses propres sous-sujets reste au premier niveau', async () => {
  const page = await openApp({ version: 1, projects: [{ id: 'p1', name: 'Achat', milestones: [] }],
    subjects: [{ id: 'a', title: 'A', priority: 1, projectId: 'p1' }, { id: 'k', title: 'K', priority: 1, parentId: 'a' }], tasks: [], settings: {}, ui: {} });
  const d = await page.db();
  assert.equal(d.subjects.find(s => s.id === 'a').parentId || null, null);
  assert.equal(d.subjects.find(s => s.id === 'k').parentId, 'a');
});
