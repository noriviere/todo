// Récurrence décalée hors des jours non travaillés, mentions « non travaillé », congé posé sur des échéances (ticket #37)
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, closeAll, ctrl, ailleurs } = require('./helpers');
after(closeAll);

const base = (tasks, extra = {}) => Object.assign({
  version: 1,
  subjects: [{ id: 'p', title: 'Sujet P', priority: 1 }],
  tasks, settings: { modules: {} }, ui: { expanded: ['p'] }
}, extra);
const ligne = (page, id) => page.locator(`#main .task[data-tid="${id}"]`).first();
const occurrence = async (page, id) => (await page.db()).tasks.find(t => t.recurFromId === id && !t.archived);

test('récurrence mensuelle : le dimanche 1er novembre devient le lundi 2, bandeau, mention, Ctrl+Z', async () => {
  const page = await openApp(base([{ id: 'r', subjectId: 'p', title: 'Rapport mensuel', deadline: '2026-10-01', recur: { freq: 'month', interval: 1 } }]), { hash: 'sujets' });
  await ligne(page, 'r').locator('[data-act="toggle-done"]').click();
  const n = await occurrence(page, 'r');
  assert.equal(n.deadline, '2026-11-02');
  assert.equal(n.decaleeDe, '2026-11-01');
  assert.match(await page.locator('#toast').innerText(), /Prochaine occurrence le lundi 2 novembre \(le dimanche 1er novembre n'est pas travaillé\)/);
  await ligne(page, n.id).locator('[data-act="details"]').click();
  assert.match(await page.locator('#drawer').innerText(), /Décalée du dimanche 1er novembre/);
  await page.keyboard.press('Escape');
  await ailleurs(page);
  await ctrl(page, 'z');
  const d = await page.db();
  assert.equal(d.tasks.find(t => t.id === 'r').status, 'todo');
  assert.equal(d.tasks.filter(t => t.recurFromId === 'r').length, 0, 'l\'occurrence décalée disparaît avec la fin de la tâche');
  assert.deepEqual(page.errors, []);
});

test('règle « ne pas décaler » : choisie dans Données, annulable, l\'occurrence garde le dimanche', async () => {
  const page = await openApp(base([{ id: 'r', subjectId: 'p', title: 'Rapport mensuel', deadline: '2026-10-01', recur: { freq: 'month', interval: 1 } }]), { hash: 'donnees' });
  await page.selectOption('#main [data-cal-decalage]', 'aucun');
  assert.equal((await page.db()).settings.decalage, 'aucun');
  await ailleurs(page);
  await ctrl(page, 'z');
  assert.equal((await page.db()).settings.decalage, 'suivant', 'Ctrl+Z remet la règle');
  await ctrl(page, 'y');
  await page.evaluate(() => { location.hash = 'sujets'; });
  await ligne(page, 'r').locator('[data-act="toggle-done"]').click();
  const n = await occurrence(page, 'r');
  assert.equal(n.deadline, '2026-11-01');
  assert.equal(n.decaleeDe, null);
  assert.deepEqual(page.errors, []);
});

test('réglage du décalage masqué quand la Récurrence est désactivée', async () => {
  const page = await openApp(base([], { settings: { modules: { recurrence: false } } }), { hash: 'donnees' });
  assert.equal(await page.locator('#main [data-cal-decalage]').count(), 0);
  assert.equal(await page.locator('#main #calendrier').count(), 1);
});

test('« Chaque jour travaillé » saute le 11 novembre et un congé', async () => {
  const page = await openApp(base([{ id: 'q', subjectId: 'p', title: 'Point quotidien', deadline: '2026-11-10', recur: { freq: 'workday', interval: 1 } }],
    { pointage: { days: { '2026-11-12': { abs: { type: 'cp', part: 'full' } }, '2026-11-13': { abs: { type: 'cp', part: 'am' } } } } }), { hash: 'sujets' });
  await ligne(page, 'q').locator('[data-act="toggle-done"]').click();
  const n = await occurrence(page, 'q');
  assert.equal(n.deadline, '2026-11-13', 'férié le 11, congé le 12, demi-journée le 13 : travaillé');
  assert.deepEqual(page.errors, []);
});

test('échéance posée un samedi : mention « non travaillé », sans déplacement', async () => {
  const page = await openApp(base([{ id: 's', subjectId: 'p', title: 'Inventaire', deadline: '2026-10-31' }, { id: 'v', subjectId: 'p', title: 'Normal', deadline: '2026-10-30' }]), { hash: 'sujets' });
  assert.equal(await ligne(page, 's').locator('.nt').innerText(), 'non travaillé');
  assert.equal(await ligne(page, 'v').locator('.nt').count(), 0);
  await ligne(page, 's').locator('[data-act="details"]').click();
  assert.match(await page.locator('#drawer').innerText(), /Jour non travaillé \(samedi\)/);
  assert.equal((await page.db()).tasks.find(t => t.id === 's').deadline, '2026-10-31');
  assert.deepEqual(page.errors, []);
});

test('congé posé sur des échéances : le bandeau les compte, « Les voir » ouvre le tableau de bord, rien ne bouge', async () => {
  const page = await openApp(base([
    { id: 'a', subjectId: 'p', title: 'Envoyer le devis', deadline: '2026-11-12' },
    { id: 'b', subjectId: 'p', title: 'Relancer le fournisseur', deadline: '2026-11-13' },
    { id: 'c', subjectId: 'p', title: 'Hors congé', deadline: '2026-11-20' },
    { id: 'f', subjectId: 'p', title: 'Déjà faite', deadline: '2026-11-12', status: 'done' }]), { hash: 'pointage' });
  await page.click('#main [data-act="pt-tab"][data-t="conges"]');
  await page.fill('#pt-from', '2026-11-12');
  await page.fill('#pt-to', '2026-11-13');
  await page.click('#main [data-act="pt-post"]');
  assert.match(await page.locator('#toast').innerText(), /2 tâches ont une échéance pendant cette absence/);
  await page.click('#toast [data-act="toast-voir"]');
  await page.waitForFunction(() => location.hash === '#dashboard');
  const d = await page.db();
  assert.deepEqual(d.tasks.map(t => t.deadline), ['2026-11-12', '2026-11-13', '2026-11-20', '2026-11-12']);
  assert.ok(d.pointage.days['2026-11-12'].abs);
  assert.deepEqual(page.errors, []);
});
