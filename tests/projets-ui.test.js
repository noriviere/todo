const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, closeAll } = require('./helpers');
after(closeAll);

const data = (on, extra = {}) => Object.assign({
  version: 1,
  subjects: [{ id: 's1', title: 'CDC machine', priority: 1 }, { id: 's2', title: 'FAT', priority: 2 }],
  tasks: [{ id: 't1', subjectId: 's1', title: 'Envoyer email', deadline: null }],
  projects: [{ id: 'p1', name: 'Achat machine', owner: 'Noel', color: '#4f63e8', order: 0, archived: false, createdAt: '2026-10-01T00:00:00Z', milestones: [] }],
  settings: { modules: on ? { projet: true } : {} }, ui: {}
}, extra);

/* ---------- Task 2 : module, données, liste ---------- */
test('module désactivé par défaut : pas d\'onglet, #projets retombe sur le tableau de bord', async () => {
  const page = await openApp(data(false), { hash: 'projets' });
  assert.equal(await page.locator('#nav a[href="#projets"]').count(), 0);
  assert.match(await page.locator('#main h1').innerText(), /Tableau de bord/);
  assert.deepEqual(page.errors, []);
});

test('module désactivé : les données projet survivent à une sauvegarde', async () => {
  const page = await openApp(data(false, { subjects: [{ id: 's1', title: 'CDC', priority: 1, projectId: 'p1', plan: { start: '2026-11-02', durDays: 3 } }] }), { hash: 'sujets' });
  await page.evaluate(() => { window.todoApp.getData().tasks[0].title = 'modifié'; window.todoApp.save(); });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('todo-noel-v1')));
  assert.equal(saved.projects[0].name, 'Achat machine');
  assert.equal(saved.subjects[0].projectId, 'p1');
  assert.equal(saved.subjects[0].plan.durDays, 3);
});

test('module actif : onglet Projets, liste, création et archivage', async () => {
  const page = await openApp(data(true), { hash: 'projets' });
  assert.equal(await page.locator('#nav a[href="#projets"]').count(), 1);
  assert.match(await page.locator('#main').innerText(), /Achat machine/);
  page.__prompt = 'Ligne 2';
  await page.click('[data-pj="new-project"]');
  let d = await page.db();
  assert.ok(d.projects.some(p => p.name === 'Ligne 2' && !p.archived && Array.isArray(p.milestones)));
  await page.click('.pj-card[data-pid="p1"] [data-pj="archive-project"]');
  d = await page.db();
  assert.equal(d.projects.find(p => p.id === 'p1').archived, true);
  assert.doesNotMatch(await page.locator('#main').innerText(), /Achat machine/);
  assert.deepEqual(page.errors, []);
});

/* ---------- Task 3 : étapes ---------- */
const sujets = (d) => Object.assign(d, { ui: { expanded: ['s1', 's2'] } });

test('module désactivé : pas de champ Projet dans le sujet', async () => {
  const page = await openApp(sujets(data(false)), { hash: 'sujets' });
  assert.equal(await page.locator('[data-pjf="project"]').count(), 0);
});

test('rattacher un sujet, régler durée, début et lien « Après »', async () => {
  const page = await openApp(sujets(data(true)), { hash: 'sujets' });
  const box = id => page.locator(`.subject[data-sid="${id}"]`);
  await box('s1').locator('[data-pjf="project"]').selectOption('p1');
  await box('s2').locator('[data-pjf="project"]').selectOption('p1');
  await box('s1').locator('[data-pjf="start"]').fill('2026-11-02');
  await box('s1').locator('[data-pjf="start"]').dispatchEvent('change');
  await box('s1').locator('[data-pjf="dur"]').fill('5');
  await box('s1').locator('[data-pjf="dur"]').dispatchEvent('change');
  await box('s2').locator('[data-pjf="dur"]').fill('3');
  await box('s2').locator('[data-pjf="dur"]').dispatchEvent('change');
  await box('s2').locator('[data-pj-after="s1"]').check();
  await box('s2').locator('[data-pjf="who"]').fill('Entreprise A');
  await box('s2').locator('[data-pjf="who"]').dispatchEvent('change');
  const d = await page.db();
  const s1 = d.subjects.find(s => s.id === 's1'), s2 = d.subjects.find(s => s.id === 's2');
  assert.equal(s1.projectId, 'p1');
  assert.deepEqual(s1.plan, { start: '2026-11-02', durDays: 5 });
  assert.deepEqual(s2.after, ['s1']);
  assert.equal(s2.who, 'Entreprise A');
  assert.match(await box('s2').innerText(), /calculé/i);
  assert.equal(await box('s2').locator('[data-pjf="start"]').count(), 0);
  assert.deepEqual(page.errors, []);
});

test('un lien en boucle est refusé', async () => {
  const d0 = sujets(data(true, { subjects: [
    { id: 's1', title: 'A', priority: 1, projectId: 'p1', plan: { start: '2026-11-02', durDays: 2 } },
    { id: 's2', title: 'B', priority: 1, projectId: 'p1', plan: { durDays: 2 }, after: ['s1'] }] }));
  const page = await openApp(d0, { hash: 'sujets' });
  await page.locator('.subject[data-sid="s1"] [data-pj-after="s2"]').click();
  const d = await page.db();
  assert.deepEqual(d.subjects.find(s => s.id === 's1').after || [], []);
  assert.match(await page.locator('#toast, .toast').first().innerText(), /boucle/);
  assert.equal(await page.locator('.subject[data-sid="s1"] [data-pj-after="s2"]').isChecked(), false);
});

test('détacher une étape nettoie liens et jalons', async () => {
  const d0 = sujets(data(true, { subjects: [
    { id: 's1', title: 'A', priority: 1, projectId: 'p1', plan: { start: '2026-11-02', durDays: 2 }, who: 'X' },
    { id: 's2', title: 'B', priority: 1, projectId: 'p1', plan: { durDays: 2 }, after: ['s1'] }] }));
  d0.projects[0].milestones = [{ id: 'm1', name: 'Livraison', date: '2026-12-01', before: ['s1', 's2'] }];
  const page = await openApp(d0, { hash: 'sujets' });
  await page.locator('.subject[data-sid="s1"] [data-pjf="project"]').selectOption('');
  const d = await page.db();
  const s1 = d.subjects.find(s => s.id === 's1');
  assert.equal(s1.projectId || null, null);
  assert.deepEqual(d.subjects.find(s => s.id === 's2').after, []);
  assert.deepEqual(d.projects[0].milestones[0].before, ['s2']);
  assert.equal(s1.title, 'A');
});

test('« Nouvelle étape » crée un sujet rattaché et l\'ouvre', async () => {
  const d0 = data(true); d0.ui = { pjOpen: 'p1' };
  const page = await openApp(d0, { hash: 'projets' });
  page.__prompt = 'Déchargement';
  await page.click('[data-pj="new-step"]');
  await page.waitForFunction(() => location.hash === '#sujets');
  const d = await page.db();
  const s = d.subjects.find(x => x.title === 'Déchargement');
  assert.equal(s.projectId, 'p1');
  assert.ok(d.ui.expanded.includes(s.id));
});

/* ---------- Task 4 : jalons ---------- */
const planned = () => {
  const d = data(true, { subjects: [
    { id: 's1', title: 'FAT', priority: 1, projectId: 'p1', plan: { start: '2026-11-02', durDays: 5 } },
    { id: 's2', title: 'SAT', priority: 1, projectId: 'p1', plan: { durDays: 3 }, after: ['s1'] }] });
  d.ui = { pjOpen: 'p1' };
  return d;
};

test('créer un jalon, le relier à une étape, alerte de dépassement', async () => {
  const page = await openApp(planned(), { hash: 'projets' });
  await page.fill('[data-pjm="new-name"]', 'Livraison machine');
  await page.fill('[data-pjm="new-date"]', '2026-11-10');
  await page.click('[data-pj="add-milestone"]');
  let d = await page.db();
  const m = d.projects[0].milestones[0];
  assert.equal(m.name, 'Livraison machine');
  assert.equal(m.date, '2026-11-10');
  await page.locator(`[data-mid="${m.id}"] [data-pj-before="s2"]`).check();
  assert.match(await page.locator('.pj-alert').innerText(), /Livraison machine/);
  assert.match(await page.locator('.pj-alert').innerText(), /SAT/);
  d = await page.db();
  assert.equal(d.projects[0].milestones[0].date, '2026-11-10');   // le jalon ne bouge pas
  assert.deepEqual(d.projects[0].milestones[0].before, ['s2']);
  // Raccourcir la FAT supprime le dépassement
  await page.evaluate(() => { const s = window.todoApp.subj('s1'); s.plan.durDays = 2; window.todoApp.save(); window.todoApp.render(); });
  assert.equal(await page.locator('.pj-alert').count(), 0);
  assert.deepEqual(page.errors, []);
});

test('alerte visible sur la carte du projet, jalon archivable', async () => {
  const d0 = planned();
  d0.projects[0].milestones = [{ id: 'm1', name: 'Paiement 30 %', date: '2026-11-05', before: ['s1'] }];
  d0.ui = {};
  const page = await openApp(d0, { hash: 'projets' });
  assert.match(await page.locator('.pj-card[data-pid="p1"]').innerText(), /alerte/);
  await page.click('[data-pj="open-project"]');
  await page.click('[data-mid="m1"] [data-pj="archive-milestone"]');
  const d = await page.db();
  assert.equal(d.projects[0].milestones[0].archived, true);
  assert.equal(await page.locator('.pj-alert').count(), 0);
});

/* ---------- Task 5 : Gantt bureau ---------- */
const gantt = () => {
  const d = planned();
  d.subjects.push({ id: 's3', title: 'Raccordement', priority: 2, projectId: 'p1', plan: {}, who: 'Entreprise A' });
  d.subjects[1].who = 'Production';
  d.projects[0].milestones = [{ id: 'm1', name: 'Livraison', date: '2026-11-10', before: ['s2'] }];
  return d;
};

test('Gantt : barres aux dates calculées, jalon, flèche, étape à planifier', async () => {
  const page = await openApp(gantt(), { hash: 'projets' });
  const b1 = page.locator('.pj-bar[data-sid="s1"]'), b2 = page.locator('.pj-bar[data-sid="s2"]');
  assert.equal(await b1.getAttribute('data-start'), '2026-11-02');
  assert.equal(await b1.getAttribute('data-end'), '2026-11-06');
  assert.equal(await b2.getAttribute('data-start'), '2026-11-09');
  const r1 = await b1.boundingBox(), r2 = await b2.boundingBox();
  assert.ok(r2.x > r1.x + r1.width - 1, 'la SAT commence après la FAT');
  assert.ok(r2.y > r1.y, 'une ligne par étape');
  assert.equal(await page.locator('.pj-g-ms[data-mid="m1"]').count(), 1);
  assert.match(await page.locator('.pj-g-ms[data-mid="m1"]').getAttribute('class'), /late/);
  assert.equal(await page.locator('.pj-arrows > path').count(), 1);
  assert.match(await page.locator('.pj-unplanned').innerText(), /Raccordement/);
  assert.match(await page.locator('.pj-legend').innerText(), /Production/);
  assert.match(await page.locator('.pj-g-names').innerText(), /Production/);
  assert.deepEqual(page.errors, []);
});

test('Gantt : échelle semaine / mois mémorisée', async () => {
  const page = await openApp(gantt(), { hash: 'projets' });
  const w1 = (await page.locator('.pj-g-track').boundingBox()).width;
  await page.click('[data-pj="scale"][data-v="month"]');
  assert.equal((await page.db()).ui.pjScale, 'month');
  const w2 = (await page.locator('.pj-g-track').boundingBox()).width;
  assert.ok(w2 < w1, 'le mois est plus compact');
});

test('Gantt : clic sur une barre ouvre l\'étape dans Sujets', async () => {
  const page = await openApp(gantt(), { hash: 'projets' });
  await page.click('.pj-bar[data-sid="s2"]');
  await page.waitForFunction(() => location.hash === '#sujets');
  assert.ok((await page.db()).ui.expanded.includes('s2'));
  assert.equal(await page.locator('.subject.open[data-sid="s2"]').count(), 1);
});

/* ---------- Task 6 : édition directe dans le Gantt ---------- */
async function drag(page, sel, fromX, dx) {
  const r = await page.locator(sel).boundingBox();
  const x = fromX === 'right' ? r.x + r.width - 3 : r.x + r.width / 2, y = r.y + r.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  for (let i = 1; i <= 5; i++) await page.mouse.move(x + dx * i / 5, y);
  await page.mouse.up();
}

test('glisser une étape libre décale les suivantes, jalon fixe', async () => {
  const page = await openApp(gantt(), { hash: 'projets' });
  await drag(page, '.pj-bar[data-sid="s1"]', 'mid', 7 * 22);
  const d = await page.db();
  assert.equal(d.subjects.find(s => s.id === 's1').plan.start, '2026-11-09');
  assert.equal(await page.locator('.pj-bar[data-sid="s2"]').getAttribute('data-start'), '2026-11-16');
  assert.equal(d.projects[0].milestones[0].date, '2026-11-10');
  assert.equal(await page.evaluate(() => location.hash), '#projets');   // pas d'ouverture après un glisser
  assert.deepEqual(page.errors, []);
});

test('étirer le bord droit change la durée', async () => {
  const page = await openApp(gantt(), { hash: 'projets' });
  await drag(page, '.pj-bar[data-sid="s2"]', 'right', 2 * 22);
  const d = await page.db();
  assert.equal(d.subjects.find(s => s.id === 's2').plan.durDays, 5);
});

test('une étape placée par ses dépendances ne se déplace pas', async () => {
  const page = await openApp(gantt(), { hash: 'projets' });
  await drag(page, '.pj-bar[data-sid="s2"]', 'mid', 7 * 22);
  const d = await page.db();
  assert.equal(d.subjects.find(s => s.id === 's2').plan.start, undefined);
  assert.equal(await page.locator('.pj-bar[data-sid="s2"]').getAttribute('data-start'), '2026-11-09');
  assert.equal(await page.evaluate(() => location.hash), '#projets');
});

/* ---------- Task 7 : mobile ---------- */
const phone = { viewport: { width: 390, height: 844 }, touch: true, hash: 'projets' };

test('mobile : Gantt compact sans débordement de page, appui sur une barre', async () => {
  const page = await openApp(gantt(), phone);
  assert.equal(await page.locator('.pj-gantt.compact').count(), 1);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390), 'pas de défilement horizontal de la page');
  assert.equal(await page.locator('.pj-grip').count(), 0);
  const h = (await page.locator('.pj-g-name[data-sid="s1"]').boundingBox()).height;
  assert.ok(h >= 44, 'lignes assez hautes pour le doigt');
  await page.locator('.pj-bar[data-sid="s1"]').scrollIntoViewIfNeeded();
  await page.locator('.pj-bar[data-sid="s1"]').tap();
  await page.waitForFunction(() => location.hash === '#sujets');
  assert.deepEqual(page.errors, []);
});

test('bascule Gantt / Liste mémorisée', async () => {
  const page = await openApp(gantt(), phone);
  await page.click('[data-pj="pview"][data-v="list"]');
  assert.equal((await page.db()).ui.pjView, 'list');
  assert.equal(await page.locator('.pj-gantt').count(), 0);
  const txt = await page.locator('.pj-mlist').innerText();
  assert.match(txt, /FAT/); assert.match(txt, /Production/); assert.match(txt, /Livraison/);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390));
});

/* ---------- Task 8 : export PDF ---------- */
test('export PDF : page d\'impression avec Gantt, étapes et jalons', async () => {
  const page = await openApp(gantt(), { hash: 'projets' });
  await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
  await page.click('[data-pj="export-pdf"]');
  assert.equal(await page.evaluate(() => window.__printed), 1);
  const sheet = page.locator('#pj-print');
  const txt = await sheet.innerText();
  assert.match(txt, /Achat machine/);
  assert.match(txt, /Exporté le/);
  assert.equal(await sheet.locator('.pj-gantt:not(.compact)').count(), 1);
  assert.equal(await sheet.locator('.pj-grip').count(), 0);
  assert.match(await sheet.locator('table.pj-steps').innerText(), /SAT[\s\S]*Production/);
  assert.match(await sheet.locator('table.pj-mstab').innerText(), /Livraison[\s\S]*dépassé/);
  assert.doesNotMatch(txt, /Envoyer email/);           // aucune tâche du quotidien
  await page.emulateMedia({ media: 'print' });
  assert.equal(await page.locator('#main').isVisible(), false);
  assert.equal(await sheet.isVisible(), true);
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  assert.equal(await page.locator('#pj-print').count(), 0);
  assert.deepEqual(page.errors, []);
});

/* ---------- Task 9 : échéance ferme, démo, mode d'emploi ---------- */
test('cadenas : échéance ferme depuis les détails, icône dans la ligne', async () => {
  const d0 = gantt(); d0.ui.expanded = ['s1']; d0.tasks[0].deadline = '2026-11-04';
  const page = await openApp(d0, { hash: 'sujets' });
  await page.click('.task[data-tid="t1"] [data-act="details"]');
  await page.locator('[data-pj-hard]').check();
  assert.equal((await page.db()).tasks[0].hardDue, true);
  assert.equal(await page.locator('.task[data-tid="t1"] .pj-lock').count(), 1);
  assert.deepEqual(page.errors, []);
});

test('cadenas masqué quand le module est désactivé', async () => {
  const d0 = data(false); d0.ui = { expanded: ['s1'] }; d0.tasks[0].hardDue = true;
  const page = await openApp(d0, { hash: 'sujets' });
  assert.equal(await page.locator('.pj-lock').count(), 0);
  await page.click('.task[data-tid="t1"] [data-act="details"]');
  assert.equal(await page.locator('[data-pj-hard]').count(), 0);
});

test('garde-fou : tâche datée après la fin prévue de son étape', async () => {
  const d0 = gantt(); d0.ui.expanded = ['s1']; d0.tasks[0].deadline = '2026-11-20';   // FAT finit le 06/11
  const page = await openApp(d0, { hash: 'sujets' });
  assert.equal(await page.locator('.task[data-tid="t1"] .pj-warn').count(), 1);
});

test('démo : projet d\'exemple avec Gantt et alerte, aide sur l\'onglet', async () => {
  const page = await openApp(null, { query: '?demo', hash: 'projets' });
  const d = await page.db();
  assert.ok(d.settings.modules.projet);
  assert.ok(d.projects.length >= 1);
  assert.match(await page.locator('.pj-card').first().innerText(), /Achat presse/);
  assert.match(await page.locator('.pj-card').first().innerText(), /alerte/);
  await page.waitForSelector('#main h1 + .gd-i[data-help="projets"], #main .gd-i[data-help="projets"]');
  await page.click('[data-pj="open-project"]');
  assert.ok(await page.locator('.pj-bar').count() >= 5);
  assert.deepEqual(page.errors, []);
});
