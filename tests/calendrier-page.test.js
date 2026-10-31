// Calendrier commun dans la page : carte de l'onglet Données, Charge, Pointage et Gantt (ticket #36)
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, closeAll, ctrl, ailleurs } = require('./helpers');
after(closeAll);

const base = (extra = {}) => Object.assign({
  version: 1,
  subjects: [{ id: 'p', title: 'Sujet P', priority: 1 }],
  tasks: [], settings: { modules: {} }, ui: {}
}, extra);
const carte = page => page.locator('#main #calendrier');
const jour = (page, n) => carte(page).locator(`[data-act="cal-jour"][data-wd="${n}"]`);

test('carte Calendrier : visible avec Charge et Pointage désactivés, le samedi s\'ajoute et Ctrl+Z l\'enlève', async () => {
  const page = await openApp(base({ settings: { modules: { charge: false, pointage: false } } }), { hash: 'donnees' });
  assert.equal(await carte(page).count(), 1);
  assert.equal(await jour(page, 1).getAttribute('aria-pressed'), 'true');
  assert.equal(await jour(page, 6).getAttribute('aria-pressed'), 'false');
  assert.match(await carte(page).innerText(), /Prochain : .*novembre \(Toussaint\)/);
  await jour(page, 6).click();
  assert.deepEqual((await page.db()).settings.workDays, [1, 2, 3, 4, 5, 6]);
  assert.equal(await jour(page, 6).getAttribute('aria-pressed'), 'true');
  await ailleurs(page);
  await ctrl(page, 'z');
  assert.deepEqual((await page.db()).settings.workDays, [1, 2, 3, 4, 5]);
  assert.deepEqual(page.errors, []);
});

test('carte Calendrier : l\'ancien choix des fériés du Pointage est repris, et la case se change', async () => {
  const page = await openApp(base({ pointage: { holidays: false } }), { hash: 'donnees' });
  const c = carte(page).locator('[data-cal-feries]');
  assert.equal(await c.isChecked(), false);
  assert.equal((await page.db()).settings.feries, false);
  await c.check();
  assert.equal((await page.db()).settings.feries, true);
  assert.deepEqual(page.errors, []);
});

test('Charge : le 11 novembre reste férié avec le Pointage désactivé', async () => {
  const page = await openApp(base({ settings: { modules: { pointage: false } }, ui: { ccRange: 30 } }), { hash: 'charge' });
  await page.click('#main [data-act="cc-day"][data-d="2026-11-11"]');
  assert.match(await page.locator('#main').innerText(), /Férié : Armistice/);
  assert.match(await page.locator('#main').innerText(), /Semaine type : lun\. mar\. mer\. jeu\. ven\./);
  assert.deepEqual(page.errors, []);
});

test('Charge : un congé posé dans le Pointage bloque le jour', async () => {
  const page = await openApp(base({ ui: { ccRange: 30 }, pointage: { days: { '2026-11-12': { abs: { type: 'cp', part: 'full' } } } } }), { hash: 'charge' });
  await page.click('#main [data-act="cc-day"][data-d="2026-11-12"]');
  assert.match(await page.locator('#main').innerText(), /Congés payés/);
  assert.deepEqual(page.errors, []);
});

test('Gantt : saute le 11 novembre, mais pas un congé de Noel', async () => {
  const d = base({
    subjects: [{ id: 'p1', title: 'Achat machine', priority: 1, isProject: true, pj: { owner: 'Noel', color: '#4f63e8', milestones: [] } },
      { id: 's1', title: 'FAT', priority: 1, parentId: 'p1', plan: { start: '2026-11-09', durDays: 5 } }],
    settings: { modules: { projet: true } }, ui: { pjOpen: 'p1' },
    pointage: { days: { '2026-11-13': { abs: { type: 'cp', part: 'full' } } } }
  });
  const page = await openApp(d, { hash: 'projets' });
  assert.equal(await page.locator('#main .pj-bar[data-sid="s1"]').getAttribute('data-end'), '2026-11-16');
  assert.deepEqual(page.errors, []);
});

test('Charge : le lien de la semaine type mène à la carte Calendrier', async () => {
  const page = await openApp(base(), { hash: 'charge' });
  await page.click('#main [data-act="cal-voir"]');
  await page.waitForFunction(() => location.hash === '#donnees');
  await carte(page).waitFor();
  assert.ok(await carte(page).isVisible());
  assert.deepEqual(page.errors, []);
});

test('Pointage : l\'objectif de la semaine du 11 novembre retire le férié et un congé', async () => {
  // Objectif par défaut : 7h45 du lundi au jeudi, 4h le vendredi (35h). Le mercredi 11 est férié, le jeudi 12 en congé.
  const page = await openApp(base({ pointage: { days: { '2026-11-12': { abs: { type: 'cp', part: 'full' } } } } }), { hash: 'pointage' });
  await page.click('#main [data-act="pt-week"][data-n="7"]');
  await page.click('#main [data-act="pt-week"][data-n="7"]');
  assert.match(await page.locator('#main .pt-weeksum').innerText(), /objectif 19h30/);
  await page.evaluate(() => { location.hash = 'donnees'; });
  await carte(page).locator('[data-cal-feries]').uncheck();
  await page.evaluate(() => { location.hash = 'pointage'; });
  assert.match(await page.locator('#main .pt-weeksum').innerText(), /objectif 27h15/, 'fériés décochés : le 11 redevient ouvré');
  assert.deepEqual(page.errors, []);
});
