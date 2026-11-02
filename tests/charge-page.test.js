// Charge dans la page : la prévision vient du calcul pur charge-plan.js (ticket #64, spec #63) ;
// la page choisit les tâches comptées (visibles, ouvertes, filtres de dimensions)
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { openApp, closeAll, aller, TODAY } = require('./helpers');
after(closeAll);

const donnees = (ui = {}) => ({
  version: 1,
  subjects: [{ id: 'p', title: 'Ligne A', priority: 1, code: 'A' }, { id: 'q', title: 'Ligne B', priority: 2, code: 'B' },
    { id: 'r', title: 'Ancien chantier', priority: 1, code: 'A', archived: true }],
  tasks: [
    { id: 'a', subjectId: 'p', title: 'Compter', deadline: TODAY, estimateMin: 60 },
    { id: 'b', subjectId: 'q', title: 'Filtrée par le code', deadline: TODAY, estimateMin: 30 },
    { id: 'c', subjectId: 'p', title: 'Faite', status: 'done', deadline: TODAY, estimateMin: 45 },
    { id: 'd', subjectId: 'p', title: 'Archivée', archived: true, deadline: TODAY, estimateMin: 20 },
    { id: 'e', subjectId: 'r', title: 'Sujet archivé', deadline: TODAY, estimateMin: 25 }
  ],
  settings: { modules: {} }, ui
});
const titreDu = (page, ds) => page.locator(`#main .cc-col[data-act="cc-day"][data-d="${ds}"]`).getAttribute('title');

test('charge-plan.js est chargé par la page avant chrono-charge.js', async () => {
  const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
  const plan = html.indexOf('<script src="modules/chrono-charge/charge-plan.js"></script>'), module = html.indexOf('<script src="modules/chrono-charge/chrono-charge.js"></script>');
  assert.ok(plan > 0 && plan < module, 'charge-plan.js avant chrono-charge.js');
  assert.ok(plan > html.indexOf('<script src="noyau/metier.js"></script>'), 'après metier.js, dont il se sert');
  const page = await openApp(donnees(), { hash: 'charge' });
  assert.equal(await page.evaluate(() => typeof window.chargePlan.prevision), 'function');
  assert.deepEqual(page.errors, []);
});

test('Charge : seules les tâches visibles, ouvertes et dans les filtres de dimensions sont comptées', async () => {
  const page = await openApp(donnees(), { hash: 'charge' });
  assert.match(await titreDu(page, TODAY), /: 1h30 prévues/, 'ni faite, ni archivée, ni dans un sujet archivé');
  const filtre = await openApp(donnees({ dims: { code: 'A', secteur: '', produit: '' } }), { hash: 'charge' });
  assert.match(await titreDu(filtre, TODAY), /: 1h prévues/, 'filtre Code A');
  assert.deepEqual(page.errors, []);
  assert.deepEqual(filtre.errors, []);
});

test('le bandeau des 7 prochains jours donne les mêmes chiffres que l\'onglet Charge', async () => {
  const page = await openApp(donnees());
  const bandeau = await page.locator('#main .cc-mini .cc-col').evaluateAll(els => els.map(e => e.getAttribute('title')));
  await aller(page, 'charge');
  const onglet = await page.locator('#main .cc-col[data-act="cc-day"]').evaluateAll(els => els.slice(0, 7).map(e => e.getAttribute('title')));
  assert.equal(bandeau.length, 7);
  assert.deepEqual(bandeau, onglet);
  assert.match(bandeau[0], /: 1h30 prévues/);
  assert.deepEqual(page.errors, []);
});

test('Charge : une tâche qui commence après son échéance est prévue à son début, en rouge « en retard »', async () => {
  const d = donnees();
  d.tasks = [{ id: 'f', subjectId: 'p', title: 'Commence trop tard', startDate: '2026-10-30', deadline: '2026-10-29', estimateMin: 50 }];
  const page = await openApp(d, { hash: 'charge' });
  assert.doesNotMatch(await titreDu(page, '2026-10-29'), /50min/, 'rien le jour de l\'échéance');
  assert.match(await titreDu(page, '2026-10-30'), /: 50min prévues/);
  await page.click('#main [data-act="cc-day"][data-d="2026-10-30"]');
  assert.equal(await page.locator('#main .cc-item[data-tid="f"] .cc-red').innerText(), 'en retard');
  assert.deepEqual(page.errors, []);
});
