// Garde-fou téléphone (≈ 390 px) : aucun écran de l'appli ne fait défiler la page de côté, tous modules actifs
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, closeAll } = require('./helpers');

after(closeAll);

const LARGEUR = 390;
const aller = (page, ecran) => page.goto(page.url().replace(/#.*$/, '') + '#' + ecran);
const largeurPage = page => page.evaluate(() => document.documentElement.scrollWidth);

test('à 390 px, en démo, chaque onglet, un projet ouvert, le panneau d\'une tâche et le guide tiennent dans la largeur', async () => {
  const page = await openApp(null, { query: '?demo', viewport: { width: LARGEUR, height: 800 }, touch: true });
  const ecrans = await page.$$eval('.side .nav a[href^="#"]', as => as.map(a => a.getAttribute('href').slice(1)));
  assert.ok(ecrans.includes('charge') && ecrans.includes('projets') && ecrans.includes('pointage'), 'tous les modules actifs en démo : ' + ecrans);
  const trop = [];
  const mesurer = async ou => { const l = await largeurPage(page); if (l > LARGEUR) trop.push(`${ou} : ${l} px`); };
  for (const e of ecrans) {
    await aller(page, e);
    await page.waitForTimeout(50);
    await mesurer('écran ' + e);
  }
  await aller(page, 'projets');
  await page.click('#main [data-pj="open-project"]');
  await mesurer('projet ouvert');
  await aller(page, 'sujets');
  await page.locator('#main [data-act="details"]').first().click();
  await mesurer('panneau d\'une tâche');
  await page.keyboard.press('Escape');
  await page.click('.gd-open');
  await mesurer('guide');
  assert.deepEqual(trop, [], 'la page défile de côté :\n' + trop.join('\n'));
  assert.deepEqual(page.errors, []);
});
