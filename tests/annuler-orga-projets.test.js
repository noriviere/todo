// Organisation et Projets passent par le point unique de modification (ticket #28)
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { openApp, closeAll, lireTache, day, ctrl, ailleurs, glisserPoignee } = require('./helpers');
after(closeAll);

const base = (extra = {}) => Object.assign({
  version: 1,
  subjects: [{ id: 'p', title: 'Sujet P', priority: 1 }],
  tasks: [{ id: 'a', subjectId: 'p', title: 'Tâche A', deadline: day(0) },
    { id: 'c', subjectId: 'p', title: 'Tâche C', deadline: day(1) }],
  settings: { modules: { projet: true } }, ui: { expanded: ['p'] }
}, extra);
const ligne = (page, id) => page.locator(`#main .task[data-tid="${id}"]`).first();

async function glisserTache(page, id, versId) {
  const t = await ligne(page, versId).boundingBox();
  await glisserPoignee(page, ligne(page, id), { x: t.x + t.width / 2, y: t.y + t.height / 2 });
  await page.waitForTimeout(50);
}

test('glisser une tâche sur une autre : échéance reprise, puis Ctrl+Z et le bandeau « Annuler » la remettent', async () => {
  const page = await openApp(base());
  await glisserTache(page, 'a', 'c');
  assert.equal((await lireTache(page, 'a')).deadline, day(1));
  await page.click('#toast [data-act="undo"]');
  assert.equal((await lireTache(page, 'a')).deadline, day(0));
  await ctrl(page, 'y');
  assert.equal((await lireTache(page, 'a')).deadline, day(1));
  await ailleurs(page);
  await ctrl(page, 'z');
  assert.equal((await lireTache(page, 'a')).deadline, day(0));
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
  await page.waitForTimeout(30);
  assert.match(await page.locator('#toast').innerText(), /Prochaine occurrence créée/, 'le message ↻ reste visible');
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
  await page.selectOption('#drawer [data-org-recur]', 'week:1');
  await page.waitForTimeout(50);
  assert.deepEqual((await lireTache(page, 'a')).recur, { freq: 'week', interval: 1 });
  await ailleurs(page);
  await ctrl(page, 'z');
  assert.equal((await lireTache(page, 'a')).recur || null, null);
});

const projet = () => base({
  subjects: [{ id: 'p', title: 'Projet', priority: 1, isProject: true, pj: { milestones: [{ id: 'm', name: 'Jalon', date: day(30), before: [] }] } },
    { id: 's1', title: 'Étape 1', priority: 1, parentId: 'p', plan: { start: day(0), durDays: 3 }, after: [] }],
  tasks: [], ui: { expanded: ['p', 's1'] }
});

test('Gantt : durée d\'une étape puis ↶, avec retour à l\'onglet Sujets', async () => {
  const page = await openApp(projet(), { hash: 'sujets' });
  const dur = page.locator('#main .subject[data-sid="s1"] [data-pjf="dur"]').first();
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
  assert.equal((await lireTache(page, 'a')).deadline, day(0));
  assert.deepEqual(page.errors, []);
});

test('contraction : plus aucun module n\'enregistre ni ne date directement, l\'interface n\'expose plus save', async () => {
  const racine = path.resolve(__dirname, '..');
  for (const f of ['modules/chrono-charge/chrono-charge.js', 'modules/pointage/pointage.js', 'modules/pointage/pointage-import.js', 'modules/organisation/organisation.js', 'modules/projets/projets.js', 'donnees/excel-import.js', 'donnees/sync.js', 'donnees/backup.js']) {
    const src = fs.readFileSync(path.join(racine, f), 'utf8');
    assert.doesNotMatch(src, /\b(A|app)\.save\(/, f);
    // Seul A.modifier date une modification ; la forme objet « updatedAt: now » (création) reste permise
    assert.doesNotMatch(src, /\.updatedAt\s*=(?!=)/, f + ' : affectation manuelle de updatedAt');
  }
  const page = await openApp(base());
  assert.equal(await page.evaluate(() => typeof window.todoApp.save), 'undefined');
});

// Corrections issues de la revue du ticket #28 (chacune d'abord en échec)
test('Gantt : barre glissée puis ↶ depuis un autre écran, avec retour à l\'onglet Projets', async () => {
  const page = await openApp(projet(), { hash: 'projets' });
  await page.click('#main [data-pj="open-project"]');
  const bar = page.locator('#main .pj-bar[data-sid="s1"]');
  const b = await bar.boundingBox();
  const ppd = +(await page.locator('#main .pj-gantt').getAttribute('data-ppd'));
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 7 * ppd, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(50);
  const debut = (await page.db()).subjects.find(s => s.id === 's1').plan.start;
  assert.notEqual(debut, day(0), 'barre déplacée');
  await page.goto(page.url().replace(/#.*$/, '#dashboard'));
  await page.waitForTimeout(50);
  await page.click('#hist [data-act="hist-undo"]');
  await page.waitForTimeout(80);
  assert.match(page.url(), /#projets/);
  assert.equal((await page.db()).subjects.find(s => s.id === 's1').plan.start, day(0));
});

test('récurrente faite arrivée d\'ailleurs : occurrence créée à l\'ouverture, hors du pas d\'une modification sans rapport', async () => {
  const page = await openApp(base({ tasks: [
    { id: 'a', subjectId: 'p', title: 'Hebdo', deadline: day(0), status: 'done', recur: { freq: 'week', interval: 1 } },
    { id: 'c', subjectId: 'p', title: 'Tâche C', deadline: day(1) }] }));
  await page.waitForTimeout(50);
  assert.ok((await page.db()).tasks.find(t => t.recurFromId === 'a'), 'occurrence créée dès l\'ouverture');
  await ligne(page, 'c').locator('[data-act="archive-task"]').click();
  await ailleurs(page);
  await ctrl(page, 'z');
  const d = await page.db();
  assert.equal(d.tasks.find(t => t.id === 'c').archived, false);
  assert.ok(d.tasks.find(t => t.recurFromId === 'a'), 'Ctrl+Z d\'une autre modification garde l\'occurrence');
});

test('Récurrence rallumée : les occurrences en attente sont créées dans leur propre pas', async () => {
  const page = await openApp(base({ settings: { modules: { recurrence: false } }, tasks: [
    { id: 'a', subjectId: 'p', title: 'Hebdo', deadline: day(0), status: 'done', recur: { freq: 'week', interval: 1 } }] }), { hash: 'donnees' });
  assert.equal((await page.db()).tasks.length, 1);
  await page.locator('#main [data-mod="recurrence"]').check({ force: true });
  await page.waitForTimeout(50);
  assert.ok((await page.db()).tasks.find(t => t.recurFromId === 'a'), 'occurrence créée');
  await ailleurs(page);
  await ctrl(page, 'z');
  const d = await page.db();
  assert.equal(d.tasks.length, 1, 'Ctrl+Z retire l\'occurrence');
  assert.equal(d.settings.modules.recurrence, true, 'sans couper le module');
});
