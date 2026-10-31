// Corrections issues de la relecture finale (une par constat, chacun d'abord en échec)
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, closeAll } = require('./helpers');
after(closeAll);

// Le projet est un sujet en mode projet, ses étapes sont ses sous-sujets
const P1 = () => ({ id: 'p1', title: 'Achat machine', priority: 1, isProject: true, pj: { owner: '', color: '#4f63e8', milestones: [] } });
const base = (subjects, tasks = [], extra = {}) => Object.assign({ version: 1, subjects: [P1(), ...subjects], tasks, settings: { modules: { projet: true } }, ui: {} }, extra);

test('avancement du projet pondéré par l\'estimation totale, pas par le reste à faire', async () => {
  const page = await openApp(base(
    [{ id: 's1', title: 'A', priority: 1, parentId: 'p1' }, { id: 's2', title: 'B', priority: 1, parentId: 'p1' }],
    [{ id: 't1', subjectId: 's1', title: 'x', estimateMin: 60, status: 'done' }, { id: 't2', subjectId: 's2', title: 'y', estimateMin: 60, status: 'todo' }]), { hash: 'projets' });
  assert.match(await page.locator('#main .pj-card').innerText(), /50%/);
});

test('export PDF lisible en thème sombre, une seule définition de flèche par vue', async () => {
  const d = base([{ id: 's1', title: 'A', priority: 1, parentId: 'p1', plan: { start: '2026-11-02', durDays: 2 } },
    { id: 's2', title: 'B', priority: 1, parentId: 'p1', plan: { durDays: 2 }, after: ['s1'] }]);
  d.ui.pjOpen = 'p1';
  const page = await openApp(d, { hash: 'projets' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.evaluate(() => { window.print = () => {}; });
  await page.click('#main [data-pj="export-pdf"]');
  await page.emulateMedia({ media: 'print', colorScheme: 'dark' });
  const bg = await page.locator('#pj-print .pj-gantt').evaluate(e => getComputedStyle(e).backgroundColor);
  assert.equal(bg, 'rgb(255, 255, 255)');
  const ids = await page.evaluate(() => [...document.querySelectorAll('marker')].map(m => m.id));
  assert.equal(new Set(ids).size, ids.length, 'ids de marqueur uniques');
  const ref = await page.locator('#pj-print .pj-arrows > path').first().getAttribute('marker-end');
  assert.ok(await page.locator('#pj-print ' + ref.slice(4, -1)).count() === 1, 'la flèche imprimée pointe dans la page imprimée');
});

test('prédécesseur sans dates : l\'étape garde un champ Début', async () => {
  const d = base([{ id: 's1', title: 'A', priority: 1, parentId: 'p1', plan: {} },
    { id: 's2', title: 'B', priority: 1, parentId: 'p1', plan: { durDays: 2 }, after: ['s1'] }]);
  d.ui.expanded = ['p1', 's2'];
  const page = await openApp(d, { hash: 'sujets' });
  assert.equal(await page.locator('#main .subject[data-sid="s2"] [data-pjf="start"]').count(), 1);
});

test('nom, responsable et couleur du projet modifiables', async () => {
  const d = base([]); d.ui.pjOpen = 'p1';
  const page = await openApp(d, { hash: 'projets' });
  await page.fill('#main [data-pjh="name"]', 'Presse 450T'); await page.locator('#main [data-pjh="name"]').dispatchEvent('change');
  await page.fill('#main [data-pjh="owner"]', 'Noel'); await page.locator('#main [data-pjh="owner"]').dispatchEvent('change');
  await page.locator('#main [data-pjh="color"]').evaluate(e => { e.value = '#23915f'; e.dispatchEvent(new Event('change', { bubbles: true })); });
  const p = (await page.db()).subjects.find(x => x.id === 'p1');
  assert.deepEqual([p.title, p.pj.owner, p.pj.color], ['Presse 450T', 'Noel', '#23915f']);
});

test('projet archivé restauré depuis les Archives avec ses étapes ; jalon archivé restaurable', async () => {
  const d = base([{ id: 's1', title: 'A', priority: 1, parentId: 'p1', archived: true, archivedWithParent: true }]);
  d.subjects[0].archived = true;
  d.subjects.push(Object.assign(P1(), { id: 'p2', title: 'Ligne 2', pj: { owner: '', color: '#23915f', milestones: [{ id: 'm1', name: 'Paiement', date: '2026-11-02', archived: true }] } }));
  const page = await openApp(d, { hash: 'archives' });
  await page.click('#main .task[data-sid="p1"] [data-act="restore-subject"]');
  let db = await page.db();
  assert.equal(db.subjects.find(x => x.id === 'p1').archived, false);
  assert.equal(db.subjects.find(x => x.id === 's1').archived, false);
  await page.evaluate(() => { location.hash = 'projets'; });
  await page.click('#main .pj-card[data-pid="p2"] [data-pj="open-project"]');
  await page.click('#main [data-mid="m1"] [data-pj="restore-milestone"]');
  db = await page.db();
  assert.equal(db.subjects.find(x => x.id === 'p2').pj.milestones[0].archived, false);
});

test('une étape archivée sert encore d\'ancre aux suivantes, sans être dessinée', async () => {
  const d = base([{ id: 's1', title: 'CDC', priority: 1, parentId: 'p1', archived: true, plan: { start: '2026-11-02', durDays: 5 } },
    { id: 's2', title: 'Validation', priority: 1, parentId: 'p1', plan: { durDays: 2 }, after: ['s1'] }]);
  d.ui.pjOpen = 'p1';
  const page = await openApp(d, { hash: 'projets' });
  assert.equal(await page.locator('#main .pj-bar[data-sid="s2"]').getAttribute('data-start'), '2026-11-09');
  assert.equal(await page.locator('#main .pj-bar[data-sid="s1"]').count(), 0);
  assert.equal(await page.locator('#main .pj-unplanned').count(), 0);
});

test('l\'import Excel « Remplacer » prévient que les sous-sujets et projets seront perdus', async () => {
  const page = await openApp(base([{ id: 's1', title: 'A', priority: 1, parentId: 'p1' }]), { hash: 'donnees' });
  const html = await page.evaluate(() => { window.todoApp.excelPreview({ subjects: [], tasks: [], skipped: [] }); return document.getElementById('excel-import-card').innerHTML; });
  assert.match(html, /sous-sujets ou en projets/);
});

test('la frise garde sa position horizontale après un re-rendu', async () => {
  const d = base([{ id: 's1', title: 'A', priority: 1, parentId: 'p1', plan: { start: '2027-03-01', durDays: 5 } }]);
  d.ui.pjOpen = 'p1';
  const page = await openApp(d, { hash: 'projets' });
  assert.ok(await page.locator('#main .pj-g-scroll').evaluate(e => e.scrollWidth - e.clientWidth > 50), 'la frise déborde');
  await page.locator('#main .pj-g-scroll').evaluate(e => { e.scrollLeft = 7; });
  await page.waitForTimeout(50);   // l'événement scroll arrive à l'image suivante, comme pour un vrai défilement
  await page.evaluate(() => window.todoApp.render());
  assert.equal(await page.locator('#main .pj-g-scroll').evaluate(e => e.scrollLeft), 7);
});
