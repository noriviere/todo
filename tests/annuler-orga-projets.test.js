// Organisation et Projets passent par le point unique de modification (ticket #28)
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { openApp, closeAll, day } = require('./helpers');
after(closeAll);

const base = (extra = {}) => Object.assign({
  version: 1,
  subjects: [{ id: 'p', title: 'Sujet P', priority: 1 }],
  tasks: [{ id: 'a', subjectId: 'p', title: 'Tâche A', deadline: day(0) },
    { id: 'c', subjectId: 'p', title: 'Tâche C', deadline: day(1) }],
  settings: { modules: { projet: true } }, ui: { expanded: ['p'] }
}, extra);
const tache = async (page, id) => (await page.db()).tasks.find(t => t.id === id);
const ligne = (page, id) => page.locator(`#main .task[data-tid="${id}"]`).first();
const ctrl = (page, k) => page.keyboard.press('Control+' + k);
const ailleurs = page => page.locator('body').click({ position: { x: 5, y: 5 } });

async function glisserTache(page, id, versId) {
  const row = ligne(page, id);
  await row.hover();
  const g = await row.locator('.org-grip').boundingBox();
  const t = await ligne(page, versId).boundingBox();
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + 20, g.y + 10, { steps: 4 });
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(50);
}

test('glisser une tâche sur une autre : échéance reprise, puis Ctrl+Z et le bandeau « Annuler » la remettent', async () => {
  const page = await openApp(base());
  await glisserTache(page, 'a', 'c');
  assert.equal((await tache(page, 'a')).deadline, day(1));
  await page.click('#toast [data-act="undo"]');
  assert.equal((await tache(page, 'a')).deadline, day(0));
  await ctrl(page, 'y');
  assert.equal((await tache(page, 'a')).deadline, day(1));
  await ailleurs(page);
  await ctrl(page, 'z');
  assert.equal((await tache(page, 'a')).deadline, day(0));
});

test('récurrente : l\'occurrence suivante est une tâche complète, et Ctrl+Z sur « Fait » la retire', async () => {
  const page = await openApp(base({ tasks: [{ id: 'a', subjectId: 'p', title: 'Hebdo', deadline: day(0), recur: { freq: 'week', interval: 1 } }] }));
  await ligne(page, 'a').locator('[data-act="toggle-done"]').click();
  await page.waitForTimeout(50);
  const d = await page.db();
  const n = d.tasks.find(t => t.recurFromId === 'a');
  assert.ok(n, 'occurrence créée');
  assert.deepEqual(n.plan, { mode: 'deadline', dailyMin: null }, 'champs d\'une tâche normale');
  assert.equal(n.notes, '');
  assert.equal(n.createdAt, n.updatedAt, 'non touchée');
  assert.match(await page.locator('#toast').innerText(), /Bravo|Annuler/);
  assert.equal(await page.locator('#toast [data-act="undo"]').count(), 1, 'le bandeau garde « Annuler »');
  await ailleurs(page);
  await ctrl(page, 'z');
  const u = await page.db();
  assert.equal(u.tasks.length, 1);
  assert.equal(u.tasks[0].status, 'todo');
  assert.equal(u.tasks[0].recurNextId || null, null);
});

test('rouvrir la tâche d\'origine range toujours l\'occurrence non touchée', async () => {
  const page = await openApp(base({ tasks: [{ id: 'a', subjectId: 'p', title: 'Hebdo', deadline: day(0), recur: { freq: 'week', interval: 1 } }] }));
  await ligne(page, 'a').locator('[data-act="toggle-done"]').click();
  await page.waitForTimeout(50);
  await page.evaluate(() => { location.hash = 'archives'; });
  await page.waitForTimeout(50);
  await page.evaluate(() => { location.hash = 'sujets'; });
  await page.waitForTimeout(50);
  await page.evaluate(() => { const A = window.todoApp; A.modifier('Rouverte', () => { A.setTaskField(A.task('a'), 'status', 'todo'); }); });
  const d = await page.db();
  const n = d.tasks.find(t => t.recurFromId === 'a');
  assert.equal(n.archived, true);
});

test('choisir une récurrence s\'annule', async () => {
  const page = await openApp(base());
  await ligne(page, 'a').locator('[data-act="details"]').click();
  await page.selectOption('[data-org-recur]', 'week:1');
  await page.waitForTimeout(50);
  assert.deepEqual((await tache(page, 'a')).recur, { freq: 'week', interval: 1 });
  await ailleurs(page);
  await ctrl(page, 'z');
  assert.equal((await tache(page, 'a')).recur || null, null);
});

const projet = () => base({
  subjects: [{ id: 'p', title: 'Projet', priority: 1, isProject: true, pj: { milestones: [{ id: 'm', name: 'Jalon', date: day(30), before: [] }] } },
    { id: 's1', title: 'Étape 1', priority: 1, parentId: 'p', plan: { start: day(0), durDays: 3 }, after: [] }],
  tasks: [], ui: { expanded: ['p', 's1'] }
});

test('Gantt : durée d\'une étape puis ↶, avec retour à l\'onglet Sujets', async () => {
  const page = await openApp(projet(), { hash: 'sujets' });
  const dur = page.locator('.subject[data-sid="s1"] [data-pjf="dur"]').first();
  await dur.fill('7');
  await dur.press('Enter');
  await page.waitForTimeout(50);
  assert.equal((await page.db()).subjects.find(s => s.id === 's1').plan.durDays, 7);
  await page.goto(page.url().replace(/#.*$/, '#dashboard'));
  await page.waitForTimeout(50);
  await page.click('#hist [data-act="hist-undo"]');
  await page.waitForTimeout(80);
  assert.match(page.url(), /#sujets/);
  assert.equal((await page.db()).subjects.find(s => s.id === 's1').plan.durDays, 3);
});

test('Projets : jalon archivé et mode projet retiré s\'annulent', async () => {
  const page = await openApp(projet(), { hash: 'projets' });
  await page.click('#main [data-pj="open-project"]');
  await page.click('#main [data-mid="m"] [data-pj="archive-milestone"]');
  assert.equal((await page.db()).subjects[0].pj.milestones[0].archived, true);
  await ailleurs(page);
  await ctrl(page, 'z');
  assert.equal((await page.db()).subjects[0].pj.milestones[0].archived || false, false);
  await page.click('#main [data-pj="unproject"]');
  assert.equal((await page.db()).subjects[0].isProject, false);
  await page.click('#hist [data-act="hist-undo"]');
  assert.equal((await page.db()).subjects[0].isProject, true);
  assert.deepEqual(page.errors, []);
});

test('modules Gestion de projet et Récurrence coupés : l\'appli marche et Ctrl+Z aussi', async () => {
  const page = await openApp(base({ settings: { modules: { projet: false, recurrence: false } } }));
  await glisserTache(page, 'a', 'c');
  await ailleurs(page);
  await ctrl(page, 'z');
  assert.equal((await tache(page, 'a')).deadline, day(0));
  assert.deepEqual(page.errors, []);
});

test('contraction : plus aucun module n\'enregistre directement, l\'interface n\'expose plus save', async () => {
  const racine = path.resolve(__dirname, '..');
  for (const f of ['chrono-charge.js', 'pointage.js', 'pointage-import.js', 'organisation.js', 'projets.js', 'excel-import.js', 'sync.js', 'backup.js'])
    assert.doesNotMatch(fs.readFileSync(path.join(racine, f), 'utf8'), /\b(A|app)\.save\(/, f);
  const page = await openApp(base());
  assert.equal(await page.evaluate(() => typeof window.todoApp.save), 'undefined');
});
