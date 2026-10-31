const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, closeAll } = require('./helpers');
after(closeAll);

// Taper une date au clavier d'un trait : le champ ne doit pas être réécrit en cours de frappe.
// Chromium headless affiche les dates en mm/jj/aaaa : les chiffres sont tapés dans cet ordre.
const data = () => ({
  version: 1,
  subjects: [{ id: 'p1', title: 'Projet', priority: 1, isProject: true, pj: { milestones: [] } },
    { id: 's1', title: 'Étape', priority: 1, parentId: 'p1', plan: { start: '2026-11-02', durDays: 2 } }],
  tasks: [{ id: 't1', subjectId: 's1', title: 'Tâche', deadline: null, status: 'todo', progress: 0 }],
  settings: { modules: { projet: true, charge: true } }, ui: { expanded: ['p1', 's1'] }
});
const typeDate = async (page, sel, digits) => {
  await page.locator(sel).first().click({ position: { x: 10, y: 10 } });
  await page.keyboard.type(digits, { delay: 30 });
};
const open = () => openApp(data(), { hash: 'sujets' });

test('deadline d\'une tâche tapée d\'un trait puis Tab', async () => {
  const page = await open();
  await typeDate(page, '[data-tid="t1"] [data-field="deadline"]', '06222026');
  await page.evaluate(() => document.activeElement.blur());   // sortie du champ
  await page.waitForTimeout(50);
  assert.equal((await page.db()).tasks[0].deadline, '2026-06-22');
  assert.deepEqual(page.errors, []);
});

test('date tapée puis Entrée : enregistrée', async () => {
  const page = await open();
  await typeDate(page, '[data-tid="t1"] [data-field="deadline"]', '06222026');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(50);
  assert.equal((await page.db()).tasks[0].deadline, '2026-06-22');
});

test('rien n\'est enregistré pendant la frappe', async () => {
  const page = await open();
  await typeDate(page, '[data-tid="t1"] [data-field="deadline"]', '062220');
  await page.waitForTimeout(50);
  assert.equal((await page.db()).tasks[0].deadline, null);
});

test('modifier le jour d\'une date existante', async () => {
  const page = await open();
  await typeDate(page, '.subject[data-sid="s1"] [data-pjf="start"]', '11052026');
  await page.evaluate(() => document.activeElement.blur());   // sortie du champ
  await page.waitForTimeout(50);
  assert.equal((await page.db()).subjects.find(s => s.id === 's1').plan.start, '2026-11-05');
});

test('fin prévue d\'une étape tapée d\'un trait', async () => {
  const page = await open();
  await typeDate(page, '.subject[data-sid="s1"] [data-pjf="end"]', '11102026');
  await page.evaluate(() => document.activeElement.blur());   // sortie du champ
  await page.waitForTimeout(50);
  assert.equal((await page.db()).subjects.find(s => s.id === 's1').plan.durDays, 7);
});

test('choix au calendrier (sans frappe) : enregistré tout de suite', async () => {
  const page = await open();
  await page.locator('#main [data-tid="t1"] [data-field="deadline"]').first().evaluate(el => {
    el.value = '2026-06-22'; el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(50);
  assert.equal((await page.db()).tasks[0].deadline, '2026-06-22');
});
