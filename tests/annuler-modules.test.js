// Chrono, Charge et Pointage passent par le point unique de modification : tout s'annule avec Ctrl+Z / ↶ (ticket #27)
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, closeAll, day, ctrl, ailleurs } = require('./helpers');
after(closeAll);

const base = (extra = {}) => Object.assign({
  version: 1,
  subjects: [{ id: 'p', title: 'Sujet P', priority: 1 }],
  tasks: [{ id: 'a', subjectId: 'p', title: 'Tâche A', deadline: day(0), estimateMin: 120 },
    { id: 'b', subjectId: 'p', title: 'Tâche B', deadline: day(0) }],
  settings: { modules: {} }, ui: { expanded: ['p'] }
}, extra);
const tache = async (page, id) => (await page.db()).tasks.find(t => t.id === id);
const ligne = (page, id) => page.locator(`#main .task[data-tid="${id}"]`).first();
const peutAnnuler = page => page.evaluate(() => !document.querySelector('#hist [data-act="hist-undo"]').disabled);

test('chrono démarré puis Ctrl+Z : arrêté et la tâche revient « À faire » ; Ctrl+Y le relance', async () => {
  const page = await openApp(base());
  await ligne(page, 'a').locator('[data-act="cc-timer"]').click();
  const t = await tache(page, 'a');
  assert.ok(t.timerStart);
  assert.equal(t.status, 'doing');
  await ailleurs(page);
  await ctrl(page, 'z');
  const u = await tache(page, 'a');
  assert.equal(u.timerStart, null);
  assert.equal(u.status, 'todo');
  await ctrl(page, 'y');
  assert.equal((await tache(page, 'a')).timerStart, t.timerStart);
});

test('annuler l\'arrêt du chrono le relance depuis son heure de départ, sans perdre de temps', async () => {
  const page = await openApp(base());
  await ligne(page, 'a').locator('[data-act="cc-timer"]').click();
  const depart = (await tache(page, 'a')).timerStart;
  await page.clock.fastForward('10:00');
  await ligne(page, 'a').locator('[data-act="cc-timer"]').click();
  const arrete = await tache(page, 'a');
  assert.equal(arrete.timerStart, null);
  assert.ok(arrete.realMin >= 10);
  await ailleurs(page);
  await ctrl(page, 'z');
  const t = await tache(page, 'a');
  assert.equal(t.timerStart, depart, 'chrono relancé à son heure d\'origine');
  assert.equal(t.realMin, 0);
  assert.equal(t.timeLogs.length, 0);
});

test('temps retiré : le bandeau « Annuler » passe par l\'historique', async () => {
  const page = await openApp(base({ tasks: [{ id: 'a', subjectId: 'p', title: 'Tâche A', deadline: day(0), realMin: 30,
    timeLogs: [{ id: 'l1', date: day(0), min: 30, kind: 'manual' }] }] }));
  await ligne(page, 'a').locator('[data-act="details"]').click();
  await page.click('#drawer [data-act="cc-log-del"]');
  assert.equal((await tache(page, 'a')).realMin, 0);
  await page.click('#toast [data-act="undo"]');
  const t = await tache(page, 'a');
  assert.equal(t.realMin, 30);
  assert.deepEqual(t.timeLogs.map(l => l.id), ['l1']);
  assert.match(await page.locator('#toast').innerText(), /Annulé/);
});

test('Charge : créneau archivé (bandeau) et capacité de la journée s\'annulent', async () => {
  const page = await openApp(base({ settings: { modules: {}, workdayMin: 420 },
    fixedSlots: [{ id: 's1', title: 'Réunion', durMin: 60, freq: 'weekly', days: [1], start: day(-30), end: null, archived: false }] }), { hash: 'charge' });
  await page.click('#main [data-slid="s1"] [data-act="cc-slot-archive"]');
  assert.equal((await page.db()).fixedSlots[0].archived, true);
  await page.click('#toast [data-act="undo"]');
  assert.equal((await page.db()).fixedSlots[0].archived, false);
  const cap = page.locator('#main [data-cc-set="workday"]');
  await cap.fill('8h');
  await cap.press('Enter');
  await page.waitForTimeout(50);
  assert.equal((await page.db()).settings.workdayMin, 480);
  await ailleurs(page);
  await ctrl(page, 'z');
  assert.equal((await page.db()).settings.workdayMin, 420);
});

test('Pointage : pointer l\'arrivée puis ↶ ; absence posée puis Ctrl+Z, avec retour à l\'onglet Pointage', async () => {
  const page = await openApp(base(), { hash: 'pointage' });
  await page.locator('#main [data-act="pt-punch"][data-f="in"]').first().click();
  assert.ok((await page.db()).pointage.days[day(0)].in);
  await page.click('#hist [data-act="hist-undo"]');
  assert.equal(((await page.db()).pointage.days[day(0)] || {}).in, undefined);

  await page.click('#main [data-act="pt-tab"][data-t="conges"]');
  await page.fill('#main #pt-from', day(1));
  await page.fill('#main #pt-to', day(1));
  await page.click('#main [data-act="pt-post"]');
  assert.ok((await page.db()).pointage.days[day(1)].abs);
  await page.goto(page.url().replace(/#.*$/, '#dashboard'));
  await page.waitForTimeout(50);
  await ctrl(page, 'z');
  await page.waitForTimeout(80);
  assert.match(page.url(), /#pointage/);
  assert.equal(((await page.db()).pointage.days[day(1)] || {}).abs, undefined);
});

test('module coupé après une modification : Ctrl+Z la défait sans rallumer le module', async () => {
  const page = await openApp(base(), { hash: 'pointage' });
  await page.locator('#main [data-act="pt-punch"][data-f="in"]').first().click();
  await page.goto(page.url().replace(/#.*$/, '#donnees'));
  await page.waitForTimeout(50);
  await page.locator('#main [data-mod="pointage"]').uncheck({ force: true });
  await page.waitForTimeout(50);
  assert.equal(await peutAnnuler(page), true, 'couper un module ne vide pas l\'historique');
  await ailleurs(page);
  await ctrl(page, 'z');
  const d = await page.db();
  assert.equal((d.pointage.days[day(0)] || {}).in, undefined);
  assert.equal(d.settings.modules.pointage, false);
  assert.deepEqual(page.errors, []);
});

test('chaque module coupé : l\'appli marche et Ctrl+Z aussi', async () => {
  for (const m of ['chrono', 'charge', 'pointage']) {
    const page = await openApp(base({ settings: { modules: { [m]: false } } }));
    await ligne(page, 'a').locator('[data-act="archive-task"]').click();
    await ailleurs(page);
    await ctrl(page, 'z');
    assert.equal((await tache(page, 'a')).archived, false, m);
    assert.deepEqual(page.errors, [], m);
  }
});

test('import d\'un fichier de pointage : un seul pas, Ctrl+Z défait tout l\'import', async () => {
  const X = require('../vendor/xlsx.mini.min.js');
  const ws = X.utils.aoa_to_sheet([['Date', 'Arrivé', 'Midi', 'Midi', 'Départ', 'CP'],
    [46006, 0.35, 0.5, 0.54, 0.73, null], [46007, 0.36, 0.5, 0.54, 0.74, null]]);
  const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, '2025');
  const buffer = Buffer.from(X.write(wb, { type: 'array', bookType: 'xlsx' }));
  const page = await openApp(base(), { hash: 'pointage' });
  await page.locator('#main [data-act="pt-punch"][data-f="in"]').first().click();   // une modification avant l'import
  await page.click('#main [data-act="pt-tab"][data-t="bilan"]');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#main [data-pti="pick"]')]);
  await fc.setFiles({ name: 'pointage.xlsx', mimeType: 'application/octet-stream', buffer });
  await page.click('#main [data-pti="go"]');
  await page.waitForTimeout(50);
  const jours = d => Object.keys(d.pointage.days).length;
  assert.equal(jours(await page.db()), 3, 'deux jours importés + le pointage du jour');
  await ailleurs(page);
  await ctrl(page, 'z');
  const d = await page.db();
  assert.equal(jours(d), 1, 'l\'import est défait d\'un coup');
  assert.ok(d.pointage.days[day(0)].in, 'le pointage d\'avant reste');
  assert.match(await page.locator('#toast').innerText(), /Annulé : Import de pointage \(2 jours\)/);
});

// Corrections issues de la revue du ticket #27 (chacune d'abord en échec)
test('chrono masqué pendant qu\'il tourne : l\'arrêt ne s\'annule pas, aucun chrono invisible ne repart', async () => {
  const page = await openApp(base(), { hash: 'donnees' });
  await page.evaluate(() => { const A = window.todoApp; A.modifier('Chrono démarré', d => { d.tasks[0].timerStart = A.nowIso(); }); });
  await page.locator('#main [data-mod="chrono"]').uncheck({ force: true });
  await page.waitForTimeout(50);
  assert.equal((await tache(page, 'a')).timerStart, null, 'arrêté en masquant le module');
  await ailleurs(page);
  await ctrl(page, 'z');
  assert.equal((await tache(page, 'a')).timerStart, null, 'Ctrl+Z ne relance pas un chrono invisible');
});

test('allumer un module pour la première fois ne vide pas l\'historique', async () => {
  const page = await openApp(base({ settings: { modules: { pointage: false, charge: false } } }));
  await ligne(page, 'a').locator('[data-act="archive-task"]').click();
  await page.evaluate(() => { location.hash = 'donnees'; });
  await page.waitForTimeout(60);
  await page.locator('#main [data-mod="charge"]').check({ force: true });
  await page.locator('#main [data-mod="pointage"]').check({ force: true });
  for (const h of ['charge', 'pointage']) { await page.evaluate(h => { location.hash = h; }, h); await page.waitForTimeout(60); }
  await page.click('#main [data-act="pt-tab"][data-t="conges"]');
  assert.equal(await peutAnnuler(page), true);
  await ailleurs(page);
  await ctrl(page, 'z');
  assert.equal((await tache(page, 'a')).archived, false);
});
