// Pointage : temps pointé d'une demi-journée sans départ et semaines complètes dans la page (ticket #59)
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, closeAll } = require('./helpers');
after(closeAll);

// Données fictives : semaines 42 et 43 (12 au 23 octobre 2026), du lundi au jeudi journée pleine, vendredi pointé le matin seulement
const JOURNEE = { in: '08:00', lunchOut: '12:00', lunchIn: '13:00', out: '16:45' };   // 7h45
const VENDREDI = { in: '08:00', lunchOut: '12:00' };                                  // 4h, sans retour ni départ
const days = {};
for (const ds of ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22']) days[ds] = Object.assign({}, JOURNEE);
for (const ds of ['2026-10-16', '2026-10-23']) days[ds] = Object.assign({}, VENDREDI);
const base = (ui = {}) => ({
  version: 1, subjects: [{ id: 'p', title: 'Sujet P', priority: 1 }], tasks: [],
  settings: { modules: {} }, ui, pointage: { days }
});
const ligne = (page, ds) => page.locator(`#main .pt-week .pt-row[data-d="${ds}"]`);

test('semaine du Pointage : le vendredi matin pointé sans départ compte ses heures, et une correction après coup recalcule', async () => {
  const page = await openApp(base(), { hash: 'pointage' });
  await page.locator('#main [data-act="pt-week"][data-n="-7"]').click();
  assert.equal(await ligne(page, '2026-10-23').locator('.pt-tot').innerText(), '4h');
  assert.match(await page.locator('#main .pt-weeksum').innerText(), /Total semaine 35h/);
  assert.doesNotMatch(await page.locator('#main').innerText(), /oubli/i, 'aucun signalement de départ oublié (hors périmètre)');
  // Début repas corrigé après coup : 11h30
  await ligne(page, '2026-10-23').locator('[data-pt="lunchOut"]').fill('11:30');
  await ligne(page, '2026-10-23').locator('[data-pt="lunchOut"]').dispatchEvent('change');
  assert.equal(await ligne(page, '2026-10-23').locator('.pt-tot').innerText(), '3h30');
  const d = (await page.db()).pointage.days['2026-10-23'];
  assert.deepEqual([d.in, d.lunchOut, d.lunchIn, d.out], ['08:00', '11:30', undefined, undefined], 'aucune heure inventée');
  assert.deepEqual(page.errors, []);
});

test('Bilan : les semaines à vendredi matin pointé sont complètes et entrent dans la moyenne et la médiane', async () => {
  const page = await openApp(base({ ptTab: 'bilan' }), { hash: 'pointage' });
  const stats = page.locator('#main .stats .stat');
  assert.equal(await stats.nth(1).locator('.v').innerText(), '35h');
  assert.match(await stats.nth(1).locator('.l').innerText(), /\(2 sem\.\)/);
  assert.equal(await stats.nth(2).locator('.v').innerText(), '35h');
  assert.equal(await stats.nth(0).locator('.v').innerText(), '70h', 'cumul : les deux vendredis comptent');
  assert.equal(await page.locator('#main .pt-col.part').count(), 1, 'seule la semaine en cours reste incomplète');
  assert.deepEqual(page.errors, []);
});

test('démo : le vendredi dernier est pointé le matin seulement, et son temps compte dans la semaine', async () => {
  const page = await openApp(null, { query: '?demo', hash: 'pointage' });
  await page.locator('#main [data-act="pt-week"][data-n="-7"]').click();
  const ven = ligne(page, '2026-10-23');
  assert.notEqual(await ven.locator('[data-pt="lunchOut"]').inputValue(), '');
  assert.equal(await ven.locator('[data-pt="lunchIn"]').inputValue(), '');
  assert.equal(await ven.locator('[data-pt="out"]').inputValue(), '');
  assert.match(await ven.locator('.pt-tot').innerText(), /^[34]h\d*$/, 'environ 4h');
  assert.deepEqual(page.errors, []);
});
