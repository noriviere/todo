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
    // Hauteur utile d'une page A4 paysage à 12 mm de marge : 186 mm ≈ 703 px
    const bottom = await page.locator('#pj-print .pj-legend').evaluate(e => e.getBoundingClientRect().bottom);
    assert.ok(bottom <= 703, `légende du Gantt en bas de la page 1 (${Math.round(bottom)} px)`);
    const pages = pdfPages(await page.pdf({ preferCSSPageSize: true, printBackground: true }));
    assert.ok(pages >= 2 && pages <= 2 + Math.ceil(n / 20), `${pages} pages`);
    assert.deepEqual(page.errors, []);
  });
}
