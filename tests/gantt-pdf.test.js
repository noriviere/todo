// Export PDF : le Gantt tient sur une seule page, même avec beaucoup d'étapes, sans page blanche au début
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, closeAll, day } = require('./helpers');
after(closeAll);

const projet = n => {
  const subjects = [{ id: 'p1', title: 'Achat machine', priority: 1, isProject: true, pj: { owner: 'Noel', color: '#4f63e8', milestones: [{ id: 'm1', name: 'Livraison', date: day(40), before: [] }] } }];
  for (let i = 0; i < n; i++) subjects.push({ id: 's' + i, title: 'Étape ' + i, priority: 2, parentId: 'p1', who: ['Prod', 'Ent A'][i % 2], plan: { start: day(i * 3), durDays: 1 + (i % 4) * 3 } });
  return { version: 1, subjects, tasks: [], settings: { modules: { projet: true } }, ui: { pjOpen: 'p1' } };
};
// Pages du PDF, et la page où commence le tableau des étapes (texte « Étapes » en légende)
const pdfPages = buf => (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;

for (const n of [3, 25, 60]) {
  test(`${n} étapes : Gantt sur la première page, tableaux à la suivante`, async () => {
    const page = await openApp(projet(n), { hash: 'projets' });
    await page.evaluate(() => { window.print = () => {}; });
    await page.click('[data-pj="export-pdf"]');
    await page.emulateMedia({ media: 'print' });
    // Hauteur utile d'une page A4 à 12 mm de marge : 186 mm ≈ 703 px en paysage, 273 mm ≈ 1032 px en portrait
    const port = n > 26;
    assert.equal(await page.locator('#pj-print').getAttribute('class'), port ? 'portrait' : 'landscape');
    assert.match(await page.locator('#pj-page').textContent(), port ? /portrait/ : /landscape/);
    const bottom = await page.locator('#pj-print .pj-legend').evaluate(e => e.getBoundingClientRect().bottom);
    assert.ok(bottom <= (port ? 1032 : 703), `légende du Gantt en bas de la page 1 (${Math.round(bottom)} px)`);
    // Lignes lisibles : beaucoup d'étapes passent en portrait plutôt que d'écraser les lignes
    assert.ok(await page.locator('#pj-print .pj-g-name').first().evaluate(e => e.offsetHeight) >= 14);
    const pages = pdfPages(await page.pdf({ preferCSSPageSize: true, printBackground: true }));
    assert.ok(pages >= 2 && pages <= 2 + Math.ceil(n / 20), `${pages} pages`);
    assert.deepEqual(page.errors, []);
  });
}

test('export depuis un téléphone : même mise en page que sur ordinateur, pas l\'affichage mobile', async () => {
  const page = await openApp(projet(12), { hash: 'projets', viewport: { width: 390, height: 800 }, touch: true });
  await page.evaluate(() => { window.print = () => {}; });
  await page.click('[data-pj="export-pdf"]');
  await page.emulateMedia({ media: 'print' });
  assert.equal(await page.locator('#pj-print .pj-g-names').evaluate(e => Math.round(parseFloat(getComputedStyle(e).width))), 270);
  assert.notEqual(await page.locator('#pj-print .pj-g-ms span').evaluate(e => getComputedStyle(e).display), 'none', 'date des jalons visible');
  assert.equal(await page.locator('#pj-print .pj-g-name.st').first().evaluate(e => getComputedStyle(e).gridTemplateColumns.split(' ').length), 3, 'nom et responsable sur une ligne');
  // La feuille est réduite pour tenir dans la largeur imprimable
  const w = await page.locator('#pj-print').evaluate(e => e.getBoundingClientRect().width);
  assert.ok(w <= 390, `feuille de ${Math.round(w)} px`);
  assert.deepEqual(page.errors, []);
});

test('Android : la fenêtre d\'impression ne bloque pas, la page PDF reste en place jusqu\'au retour dans l\'appli', async () => {
  const page = await openApp(projet(19), { hash: 'projets', viewport: { width: 390, height: 800 }, touch: true });
  // Chrome Android : window.print() rend la main tout de suite et « afterprint » arrive avant la capture de la page
  await page.evaluate(() => { window.print = () => window.dispatchEvent(new Event('afterprint')); });
  await page.click('[data-pj="export-pdf"]');
  await page.emulateMedia({ media: 'print' });
  assert.equal(await page.locator('#pj-print').count(), 1, 'page PDF toujours là');
  assert.equal(await page.locator('#pj-page').count(), 1, 'format de page toujours là');
  assert.equal(await page.locator('.app').evaluate(e => getComputedStyle(e).display), 'none', 'l\'écran de l\'appli n\'est pas imprimé');
  // De retour dans l'appli, un geste nettoie la page d'impression
  await page.emulateMedia({ media: 'screen' });
  await page.waitForTimeout(1100);
  await page.mouse.click(5, 300);
  assert.equal(await page.locator('#pj-print').count(), 0);
  assert.equal(await page.locator('#pj-page').count(), 0);
  assert.equal(await page.evaluate(() => document.body.classList.contains('pj-printing')), false);
  assert.deepEqual(page.errors, []);
});
