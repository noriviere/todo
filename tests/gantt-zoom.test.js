// Gantt : zoom libre (− / + / Tout voir, Ctrl + molette) et avancement sous le nom des étapes
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, closeAll, day } = require('./helpers');
after(closeAll);

const data = () => ({
  version: 1, settings: { modules: { projet: true } }, ui: { pjOpen: 'p1' },
  subjects: [{ id: 'p1', title: 'Achat machine', priority: 1, isProject: true, pj: { owner: '', color: '#4f63e8', milestones: [] } },
    { id: 's1', title: 'Cahier des charges', priority: 2, parentId: 'p1', who: 'Noel', plan: { start: day(-10), durDays: 10 } },
    { id: 's2', title: 'Choix fournisseur', priority: 2, parentId: 'p1', plan: { start: day(20), durDays: 1 } },
    { id: 's3', title: 'Fabrication', priority: 2, parentId: 'p1', plan: { start: day(30), durDays: 120 } }],
  tasks: [{ id: 't1', subjectId: 's2', title: 'a', status: 'done', estimateMin: 60 }, { id: 't2', subjectId: 's2', title: 'b', status: 'todo', estimateMin: 60 }]
});
const ppd = page => page.locator('#main .pj-gantt').evaluate(g => +g.dataset.ppd);
const trackW = page => page.locator('#main .pj-g-track').evaluate(t => t.offsetWidth);

test('boutons − et + : zoom mémorisé, Semaines remet l\'échelle prête à l\'emploi', async () => {
  const page = await openApp(data(), { hash: 'projets' });
  const w0 = await trackW(page);
  await page.click('[data-pj="zoom"][data-v="out"]');
  assert.ok(await ppd(page) < 22);
  assert.ok(await trackW(page) < w0, 'les mois sont plus étroits');
  assert.equal((await page.db()).ui.pjPpd, await ppd(page));
  assert.equal(await page.locator('[data-pj="scale"].on').count(), 0, 'aucune échelle prête cochée');
  await page.click('[data-pj="zoom"][data-v="in"]');
  await page.click('[data-pj="zoom"][data-v="in"]');
  assert.ok(await ppd(page) > 22);
  await page.click('[data-pj="scale"][data-v="week"]');
  assert.equal(await ppd(page), 22);
  assert.equal((await page.db()).ui.pjPpd, null);
  assert.deepEqual(page.errors, []);
});

test('Tout voir : tout le projet tient dans la largeur, repères adaptés', async () => {
  for (const width of [1280, 390]) {
    const page = await openApp(data(), { hash: 'projets', viewport: { width, height: 900 } });
    await page.click('[data-pj="zoom"][data-v="all"]');
    const [cw, sw] = await page.locator('#main .pj-g-scroll').evaluate(s => [s.clientWidth, s.scrollWidth]);
    assert.ok(sw <= cw + 1, `${width} px : pas de défilement (${sw} > ${cw})`);
    assert.ok(await page.locator('#main .pj-tick').count() >= 2);
    assert.notEqual(await page.locator('#main .pj-gantt').getAttribute('data-mode'), 'week');
    assert.deepEqual(page.errors, []);
  }
});

test('Ctrl + molette sur la frise zoome, la molette seule fait défiler', async () => {
  const page = await openApp(data(), { hash: 'projets' });
  const box = await page.locator('#main .pj-g-scroll').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 80);
  await page.mouse.wheel(0, 300);
  assert.equal(await ppd(page), 22);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, 300);
  await page.keyboard.up('Control');
  await page.waitForFunction(() => +document.querySelector('#main .pj-gantt').dataset.ppd < 22);
  assert.deepEqual(page.errors, []);
});

test('l\'avancement de chaque étape est écrit sous son nom', async () => {
  const page = await openApp(data(), { hash: 'projets' });
  const name = page.locator('#main .pj-g-name[data-sid="s2"]');
  assert.match(await name.locator('.pc').innerText(), /50\s%/);
  assert.equal(await name.locator('.pg .bar i').evaluate(i => i.style.width), '50%');
  // L'étape d'un jour est trop courte pour écrire dans sa barre : la jauge du nom prend le relais
  assert.equal(await page.locator('#main .pj-bar[data-sid="s2"] span').count(), 0);
});
