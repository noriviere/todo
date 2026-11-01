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
const jour = (page, n) => carte(page).locator(`[data-cal-horaire][data-wd="${n}"]`);
// Horaire de Noel, indexé par getDay() (0 = dimanche) : 7h45 du lundi au jeudi, 4h le vendredi
const NOEL = [0, 465, 465, 465, 465, 240, 0];
const saisir = async (page, n, v) => { await jour(page, n).fill(v); await jour(page, n).press('Enter'); await page.waitForTimeout(50); };
// Texte d'un élément sur une ligne (les listes en flex sont lues avec des retours à la ligne)
const texte = loc => loc.innerText().then(t => t.replace(/\s+/g, ' '));
// Détail d'un jour de la vue Charge
const detailCharge = async (page, ds) => { await page.click(`#main [data-act="cc-day"][data-d="${ds}"]`); return page.locator('#main .cc-detail p').first().innerText(); };

test('carte Calendrier : une durée par jour, visible avec Charge et Pointage désactivés ; le samedi s\'ajoute à 4h et Ctrl+Z l\'enlève', async () => {
  const page = await openApp(base({ settings: { modules: { charge: false, pointage: false } } }), { hash: 'donnees' });
  assert.equal(await carte(page).count(), 1);
  assert.equal(await carte(page).locator('[data-act="cal-jour"]').count(), 0, 'plus de cases à cocher');
  assert.equal(await jour(page, 1).inputValue(), '7h', 'sans Pointage : l\'ancienne capacité (7h) sur chaque jour');
  assert.equal(await jour(page, 6).inputValue(), '0');
  assert.match(await carte(page).innerText(), /Prochain : .*1er novembre \(Toussaint\)/);
  assert.match(await carte(page).innerText(), /Soit 35h par semaine · journée pleine \(« 1j »\) : 7h/);
  await saisir(page, 6, '4h');
  assert.deepEqual((await page.db()).settings.horaire, [0, 420, 420, 420, 420, 420, 240]);
  assert.equal(await jour(page, 6).inputValue(), '4h');
  const sem = () => page.evaluate(() => window.todoApp.calendrier().semaine);
  assert.deepEqual(await sem(), [1, 2, 3, 4, 5, 6], 'le samedi entre dans la semaine type');
  await ailleurs(page);
  await ctrl(page, 'z');
  assert.deepEqual((await page.db()).settings.horaire, [0, 420, 420, 420, 420, 420, 0]);
  assert.equal(await jour(page, 6).inputValue(), '0');
  await saisir(page, 1, '0');
  assert.deepEqual(await sem(), [2, 3, 4, 5], 'un jour mis à 0 sort de la semaine type');
  assert.deepEqual(page.errors, []);
});

test('carte Calendrier : une durée illisible ou une semaine sans aucun jour est refusée, rien ne change', async () => {
  const page = await openApp(base({ settings: { modules: {}, horaire: [0, 0, 0, 0, 0, 240, 0] } }), { hash: 'donnees' });
  await saisir(page, 2, 'bientôt');
  assert.match(await page.locator('#toast').innerText(), /Durée non comprise/);
  assert.equal(await jour(page, 2).inputValue(), '0');
  await saisir(page, 5, '0');
  assert.match(await page.locator('#toast').innerText(), /Garde au moins un jour/);
  assert.equal(await jour(page, 5).inputValue(), '4h');
  assert.deepEqual((await page.db()).settings.horaire, [0, 0, 0, 0, 0, 240, 0]);
  assert.deepEqual(page.errors, []);
});

test('reprise sans ressaisie : l\'Objectif par jour du Pointage devient l\'horaire de la semaine type, les anciens réglages restent', async () => {
  const page = await openApp(base({ settings: { modules: {}, workdayMin: 420, workDays: [1, 2, 3, 4, 5] }, pointage: { dayMin: { 1: 465, 2: 465, 3: 465, 4: 465, 5: 240, 6: 0, 0: 0 } } }), { hash: 'donnees' });
  assert.deepEqual(await Promise.all([1, 5, 6].map(n => jour(page, n).inputValue())), ['7h45', '4h', '0']);
  const d = await page.db();
  assert.deepEqual(d.settings.horaire, NOEL);
  assert.equal(d.settings.workdayMin, 420);
  assert.deepEqual(d.pointage.dayMin, { 1: 465, 2: 465, 3: 465, 4: 465, 5: 240, 6: 0, 0: 0 });
  assert.deepEqual(page.errors, []);
});

test('« 1j » dans une estimation vaut la journée pleine (7h45)', async () => {
  const page = await openApp(base({ tasks: [{ id: 't', subjectId: 'p', title: 'Tâche' }], settings: { modules: {}, horaire: NOEL } }), { hash: 'sujets' });
  assert.equal(await page.evaluate(() => window.todoApp.parseDur('1j')), 465);
  assert.equal(await page.evaluate(() => window.todoApp.parseDur('0.5j')), 233);
  assert.deepEqual(page.errors, []);
});

for (const pointage of [true, false]) {
  test(`Charge : capacité de 4h le vendredi, 7h45 le jeudi, Pointage ${pointage ? 'activé' : 'désactivé'}`, async () => {
    const page = await openApp(base({ settings: { modules: { pointage }, horaire: NOEL } }), { hash: 'charge' });
    assert.match(await detailCharge(page, '2026-10-30'), /sur 4h/, 'vendredi 30 octobre');
    assert.match(await detailCharge(page, '2026-10-29'), /sur 7h45/, 'jeudi 29 octobre');
    assert.match(await page.locator('#main .cc-col[data-d="2026-10-30"]').getAttribute('title'), /sur 4h/);
    assert.match(await texte(page.locator('#main .cc-settings')), /Capacité de chaque jour : lun\. 7h45 mar\. 7h45 mer\. 7h45 jeu\. 7h45 ven\. 4h/);
    assert.deepEqual(page.errors, []);
  });
}

test('Charge : un congé d\'une journée ou d\'une demi-journée un vendredi à 4h libère tout le vendredi ; une demi-journée un jeudi retire la moitié d\'une journée pleine', async () => {
  const page = await openApp(base({ settings: { modules: {}, horaire: NOEL }, ui: { ccRange: 28 },
    pointage: { days: { '2026-11-06': { abs: { type: 'cp', part: 'full' } }, '2026-11-13': { abs: { type: 'cp', part: 'am' } }, '2026-11-12': { abs: { type: 'rtt', part: 'pm' } } } } }), { hash: 'charge' });
  assert.match(await detailCharge(page, '2026-11-06'), /4h prévues sur 4h/, 'journée un vendredi : les 4h sont prises');
  assert.match(await detailCharge(page, '2026-11-13'), /4h prévues sur 4h/, 'demi-journée un vendredi : tout le vendredi est pris');
  assert.match(await detailCharge(page, '2026-11-12'), /3h53 prévues sur 7h45 · libre 3h52/, 'demi-journée un jeudi : la moitié de 7h45 retirée');
  assert.deepEqual(page.errors, []);
});

test('Pointage : l\'objectif vient de l\'horaire de la semaine type, sans saisie propre ; un congé d\'un vendredi compte 1 j, une demi-journée 0,5 j', async () => {
  const page = await openApp(base({ settings: { modules: {}, horaire: NOEL },
    pointage: { days: { '2026-11-06': { abs: { type: 'cp', part: 'full' } }, '2026-11-13': { abs: { type: 'cp', part: 'am' } } } } }), { hash: 'pointage' });
  await page.click('#main [data-act="pt-week"][data-n="7"]');
  assert.match(await page.locator('#main .pt-weeksum').innerText(), /objectif 31h/, 'semaine du 2 novembre : vendredi en congé, 4 × 7h45');
  await page.click('#main [data-act="pt-week"][data-n="7"]');
  assert.match(await page.locator('#main .pt-weeksum').innerText(), /objectif 23h15/, 'semaine du 9 novembre : mercredi férié, vendredi en demi-journée (libéré)');
  const n = await page.evaluate(() => window.todoApp.pointage.counter('cp', 2026));
  assert.equal(n.n1.planned + n.n.planned, 1.5, 'jours posés : 1 + 0,5');
  await page.click('#main [data-act="pt-tab"][data-t="bilan"]');
  assert.equal(await page.locator('#main [data-pt-set="day"]').count(), 0, 'plus de saisie « Objectif par jour »');
  assert.match(await texte(page.locator('#main')), /Objectif par jour : l'horaire de la semaine type, Lun 7h45 Mar 7h45 Mer 7h45 Jeu 7h45 Ven 4h/);
  assert.deepEqual(page.errors, []);
});

test('Bilan : à côté de la moyenne, les semaines complètes se jugent sur l\'horaire de la semaine type, avec le lien vers ce réglage', async () => {
  const page = await openApp(base({ settings: { modules: {}, horaire: NOEL }, ui: { ptTab: 'bilan' } }), { hash: 'pointage' });
  const mention = page.locator('#main .pt-complete');
  assert.match(await texte(mention), /semaines complètes seulement, où chaque jour de l'horaire de la semaine type \(Lun 7h45, Mar 7h45, Mer 7h45, Jeu 7h45, Ven 4h\)/);
  await mention.locator('[data-act="cal-voir"]').click();
  await page.waitForFunction(() => location.hash === '#donnees');
  await carte(page).waitFor();
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
  assert.match(await texte(page.locator('#main')), /Capacité de chaque jour : lun\. 7h mar\. 7h mer\. 7h jeu\. 7h ven\. 7h/);
  assert.deepEqual(page.errors, []);
});

test('Charge : un congé posé dans le Pointage bloque le jour', async () => {
  const page = await openApp(base({ ui: { ccRange: 30 }, pointage: { days: { '2026-11-12': { abs: { type: 'cp', part: 'full' } } } } }), { hash: 'charge' });
  await page.click('#main [data-act="cc-day"][data-d="2026-11-12"]');
  assert.match(await page.locator('#main').innerText(), /Congés payés/);
  assert.deepEqual(page.errors, []);
});

test('Gantt : saute le 11 novembre, mais pas un congé de Noel ; le vendredi à 4h reste un jour ouvré', async () => {
  const d = base({
    subjects: [{ id: 'p1', title: 'Achat machine', priority: 1, isProject: true, pj: { owner: 'Noel', color: '#4f63e8', milestones: [] } },
      { id: 's1', title: 'FAT', priority: 1, parentId: 'p1', plan: { start: '2026-11-09', durDays: 5 } }],
    settings: { modules: { projet: true }, horaire: NOEL }, ui: { pjOpen: 'p1' },
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
  // Horaire : 7h45 du lundi au jeudi, 4h le vendredi (35h). Le mercredi 11 est férié, le jeudi 12 en congé.
  const page = await openApp(base({ settings: { modules: {}, horaire: NOEL }, pointage: { days: { '2026-11-12': { abs: { type: 'cp', part: 'full' } } } } }), { hash: 'pointage' });
  await page.click('#main [data-act="pt-week"][data-n="7"]');
  await page.click('#main [data-act="pt-week"][data-n="7"]');
  assert.match(await page.locator('#main .pt-weeksum').innerText(), /objectif 19h30/);
  await page.evaluate(() => { location.hash = 'donnees'; });
  await carte(page).locator('[data-cal-feries]').uncheck();
  await page.evaluate(() => { location.hash = 'pointage'; });
  assert.match(await page.locator('#main .pt-weeksum').innerText(), /objectif 27h15/, 'fériés décochés : le 11 redevient ouvré');
  assert.deepEqual(page.errors, []);
});
