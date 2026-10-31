const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, closeAll } = require('./helpers');
after(closeAll);

// Étapes d'un projet : choisir la fin prévue au lieu d'une durée
const data = steps => ({
  version: 1,
  subjects: [{ id: 'p1', title: 'Achat machine', priority: 1, isProject: true, pj: { milestones: [] } }, ...steps],
  tasks: [], settings: { modules: { projet: true } }, ui: { expanded: ['p1', 's1', 's2'] }
});
const box = (page, id) => page.locator(`#main .subject[data-sid="${id}"]`);
const setEnd = async (page, id, v) => {
  const el = box(page, id).locator('[data-pjf="end"]');
  await el.fill(v);
  await el.dispatchEvent('change');
};
const plan = async (page, id) => (await page.db()).subjects.find(s => s.id === id).plan;

test('choisir la fin d\'une étape libre recalcule sa durée en jours ouvrés', async () => {
  const page = await openApp(data([{ id: 's1', title: 'CDC', priority: 1, parentId: 'p1', plan: { start: '2026-11-02', durDays: 1 } }]), { hash: 'sujets' });
  assert.equal(await box(page, 's1').locator('[data-pjf="end"]').inputValue(), '2026-11-02');
  await setEnd(page, 's1', '2026-11-10');   // lun 2 → mar 10 : 7 jours ouvrés
  assert.deepEqual(await plan(page, 's1'), { start: '2026-11-02', durDays: 7 });
  assert.equal(await box(page, 's1').locator('[data-pjf="dur"]').inputValue(), '7');
  assert.equal(await box(page, 's1').locator('[data-pjf="end"]').inputValue(), '2026-11-10');
  assert.deepEqual(page.errors, []);
});

test('changer la durée fait bouger la fin', async () => {
  const page = await openApp(data([{ id: 's1', title: 'CDC', priority: 1, parentId: 'p1', plan: { start: '2026-11-02', durDays: 1 } }]), { hash: 'sujets' });
  const dur = box(page, 's1').locator('[data-pjf="dur"]');
  await dur.fill('5');
  await dur.dispatchEvent('change');
  assert.equal(await box(page, 's1').locator('[data-pjf="end"]').inputValue(), '2026-11-06');
});

test('étape après une autre : la fin choisie part du début calculé', async () => {
  const page = await openApp(data([
    { id: 's1', title: 'A', priority: 1, parentId: 'p1', plan: { start: '2026-11-02', durDays: 2 } },
    { id: 's2', title: 'B', priority: 1, parentId: 'p1', plan: { durDays: 1 }, after: ['s1'] }]), { hash: 'sujets' });
  await setEnd(page, 's2', '2026-11-10');   // début calculé mer 4 → mar 10 : 5 jours ouvrés
  assert.equal((await plan(page, 's2')).durDays, 5);
  assert.deepEqual(page.errors, []);
});

test('une fin avant le début est refusée', async () => {
  const page = await openApp(data([{ id: 's1', title: 'CDC', priority: 1, parentId: 'p1', plan: { start: '2026-11-04', durDays: 3 } }]), { hash: 'sujets' });
  await setEnd(page, 's1', '2026-11-02');
  assert.equal((await plan(page, 's1')).durDays, 3);
  assert.match(await page.locator('#toast').first().innerText(), /avant le début/);
  assert.equal(await box(page, 's1').locator('[data-pjf="end"]').inputValue(), '2026-11-06');
});

test('sans début, pas de champ fin : le message explique quoi saisir', async () => {
  const page = await openApp(data([{ id: 's1', title: 'CDC', priority: 1, parentId: 'p1' }]), { hash: 'sujets' });
  assert.equal(await box(page, 's1').locator('[data-pjf="end"]').count(), 0);
  assert.match(await box(page, 's1').innerText(), /indique un début/);
});
