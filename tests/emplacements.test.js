// Emplacements nommés du cœur (ticket #45, spec #44) : ordre des onglets, bandeau Charge, poignées ⋮⋮, aller au sujet.
// Refonte invisible : ces tests figent ce que voit Noel, ils ne nomment aucun emplacement interne.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openApp, closeAll, day, aller } = require('./helpers');
after(closeAll);

const TOUS = ['dashboard', 'sujets', 'projets', 'charge', 'pointage', 'inbox', 'archives', 'donnees'];
const LIBELLES = ['Tableau de bord', 'Sujets', 'Projets', 'Charge', 'Pointage', 'Boîte de réception', 'Archives', 'Données'];

// Sujet p (code A) et son sous-sujet c, sujet q ; un sujet et une tâche archivés pour l'onglet Archives
const donnees = (modules = { projet: true }, extra = {}) => Object.assign({
  version: 1,
  subjects: [
    { id: 'p', title: 'Ligne de conditionnement', priority: 1, code: 'A' },
    { id: 'c', title: 'Réglages', priority: 1, parentId: 'p' },
    { id: 'q', title: 'Audit fournisseur', priority: 2 },
    { id: 'r', title: 'Ancien chantier', priority: 3, archived: true }
  ],
  tasks: [
    { id: 'a', subjectId: 'p', title: 'Commander les capteurs', deadline: day(0), estimateMin: 60 },
    { id: 'b', subjectId: 'c', title: 'Régler la vitesse', deadline: day(1), estimateMin: 30 },
    { id: 'e', subjectId: 'q', title: 'Préparer la grille', deadline: day(3) },
    { id: 'z', subjectId: 'q', title: 'Vieille tâche', archived: true }
  ],
  settings: { modules }, ui: { expanded: ['p', 'c', 'q'] }
}, extra);

const onglets = page => page.$$eval('#nav a', as => as.map(a => a.getAttribute('href').slice(1)));

/* ---------- Ordre des onglets ---------- */
test('tous modules allumés, le menu montre dans l\'ordre : Tableau de bord, Sujets, Projets, Charge, Pointage, Boîte de réception, Archives, Données', async () => {
  const page = await openApp(donnees());
  assert.deepEqual(await onglets(page), TOUS);
  assert.deepEqual(await page.$$eval('#nav a .lbl', l => l.map(x => x.textContent)), LIBELLES);
  assert.deepEqual(page.errors, []);
});

test('éteindre un module retire son onglet sans changer l\'ordre des autres ; une adresse vers cet onglet ramène au tableau de bord', async () => {
  for (const [mod, onglet] of [['charge', 'charge'], ['pointage', 'pointage'], ['projet', 'projets']]) {
    const page = await openApp(donnees({ projet: true, [mod]: false }), { hash: onglet });
    assert.deepEqual(await onglets(page), TOUS.filter(x => x !== onglet), 'module ' + mod + ' éteint');
    assert.equal(await page.locator('#nav a.on').getAttribute('href'), '#dashboard');
    assert.equal(await page.locator('#main h1').first().textContent(), 'Tableau de bord');
    assert.deepEqual(page.errors, []);
  }
});

test('un onglet de module garde sa place quel que soit l\'ordre de chargement des fichiers', async () => {
  // Copie de index.html dont les fichiers des modules se chargent dans l'ordre inverse
  const racine = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(racine, 'index.html'), 'utf8');
  const MODS = ['chrono-charge.js', 'pointage.js', 'pointage-import.js', 'organisation.js', 'projets-plan.js', 'projets.js'];
  const balise = f => `<script src="${f}"></script>`;
  MODS.forEach(f => assert.ok(html.includes(balise(f)), f + ' chargé par index.html'));
  let copie = html;
  MODS.forEach(f => { copie = copie.replace(balise(f) + '\n', ''); });
  // projets-plan.js reste avant projets.js, qui s'en sert à son chargement
  const inverse = ['projets-plan.js', 'projets.js', 'organisation.js', 'pointage.js', 'pointage-import.js', 'chrono-charge.js'];
  copie = copie.replace('<script src="sync.js">', inverse.map(balise).join('\n') + '\n<script src="sync.js">')
    .replace('<head>', `<head><base href="file://${racine}/">`);
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-ordre-'));
  const fichier = path.join(dossier, 'index.html');
  try {
    fs.writeFileSync(fichier, copie);
    const page = await openApp(donnees(), { url: 'file://' + fichier });
    assert.deepEqual(await onglets(page), TOUS);
    assert.deepEqual(page.errors, []);
  } finally {
    fs.rmSync(dossier, { recursive: true, force: true });
  }
});

/* ---------- Bandeau Charge du tableau de bord ---------- */
test('le bandeau Charge apparaît avant la première section du tableau de bord, après les statistiques', async () => {
  const page = await openApp(donnees());
  assert.equal(await page.locator('#main .cc-mini').count(), 1);
  const ordre = await page.evaluate(() => {
    const m = document.querySelector('#main .cc-mini'), sec = document.querySelector('#main details.sec'), st = document.querySelector('#main .stats');
    return { avantSection: !!(m.compareDocumentPosition(sec) & Node.DOCUMENT_POSITION_FOLLOWING), apresStats: !!(st.compareDocumentPosition(m) & Node.DOCUMENT_POSITION_FOLLOWING),
      suivant: m.nextElementSibling && m.nextElementSibling.matches('details.sec') };
  });
  assert.deepEqual(ordre, { avantSection: true, apresStats: true, suivant: true });
  assert.match(await page.locator('#main .cc-mini').textContent(), /Charge des 7 prochains jours/);
});

test('le bandeau Charge est absent avec la Charge éteinte ou sans tâche', async () => {
  const eteinte = await openApp(donnees({ projet: true, charge: false }));
  assert.equal(await eteinte.locator('#main .cc-mini').count(), 0);
  assert.ok(await eteinte.locator('#main details.sec').count() > 0);
  const vide = await openApp(donnees(undefined, { tasks: [] }));
  assert.equal(await vide.locator('#main .cc-mini').count(), 0);
  assert.deepEqual([...eteinte.errors, ...vide.errors], []);
});

/* ---------- Poignées ⋮⋮ ---------- */
test('chaque tâche et chaque en-tête de sujet commence par une poignée ⋮⋮ hors Archives ; aucune dans Archives', async () => {
  const page = await openApp(donnees());
  const premiers = sel => page.$$eval(sel, els => els.map(el => el.firstElementChild && el.firstElementChild.matches('.org-grip') && el.firstElementChild.textContent === '⋮⋮'));
  for (const ecran of ['dashboard', 'sujets', 'charge', 'projets', 'inbox']) {
    await aller(page, ecran);
    const taches = await premiers('#main .task[data-tid]'), tetes = await premiers('#main .subject[data-sid] > .s-head');
    if (ecran === 'dashboard' || ecran === 'sujets') assert.ok(taches.length >= 3, ecran + ' : des tâches affichées');
    if (ecran === 'sujets') assert.equal(tetes.length, 3, 'sujets : p, c et q');
    assert.ok(taches.every(Boolean), ecran + ' : une tâche sans poignée en tête');
    assert.ok(tetes.every(Boolean), ecran + ' : un en-tête de sujet sans poignée en tête');
    assert.equal(await page.locator('#main .org-grip').count(), taches.length + tetes.length, ecran + ' : une seule poignée par ligne');
  }
  await aller(page, 'archives');
  assert.ok(await page.locator('#main .task').count() >= 2, 'archives : sujet et tâche archivés affichés');
  assert.equal(await page.locator('#main .org-grip').count(), 0);
  assert.deepEqual(page.errors, []);
});

/* ---------- Aller au sujet ---------- */
test('le ↗ d\'une tâche du tableau de bord amène sur sa ligne surlignée dans Sujets', async () => {
  const page = await openApp(donnees(undefined, { ui: { expanded: [] } }));
  await page.click('#main .task[data-tid="b"] [data-org-goto]');
  await page.waitForFunction(() => location.hash === '#sujets');
  await page.locator('#main .subject.open[data-sid="c"] .task[data-tid="b"].flash').waitFor();
  const d = await page.db();
  assert.ok(d.ui.expanded.includes('c') && d.ui.expanded.includes('p'));
  assert.deepEqual(page.errors, []);
});

test('le ↗ centre la ligne visée dans la fenêtre de l\'onglet Sujets', async () => {
  // Assez de tâches pour que l'onglet Sujets défile ; la ligne visée est la dernière du sujet q
  const remplissage = Array.from({ length: 30 }, (_, i) => ({ id: 'f' + i, subjectId: 'q', title: 'Tâche de remplissage ' + i, deadline: day(10) }));
  const d = donnees(undefined, { ui: { expanded: ['p', 'c', 'q'] } });
  d.tasks.push(...remplissage, { id: 'y', subjectId: 'q', title: 'Tâche visée', deadline: day(2) });
  const page = await openApp(d);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.click('#main .task[data-tid="y"] [data-org-goto]');
  await page.locator('#main .task[data-tid="y"].flash').waitFor();
  const ecart = await page.locator('#main .task[data-tid="y"]').evaluate(el => {
    const r = el.getBoundingClientRect();
    return Math.abs(r.top + r.height / 2 - innerHeight / 2);
  });
  assert.ok(ecart < 40, 'ligne à ' + Math.round(ecart) + ' px du centre');
  assert.deepEqual(page.errors, []);
});

// Projet p1, étape s1 (sous-sujet) ; sans code, donc cachée dans Sujets par un filtre Code
const projet = (ui = {}) => ({
  version: 1,
  subjects: [
    { id: 'p1', title: 'Achat machine', priority: 1, isProject: true, pj: { owner: 'Noel', color: '#4f63e8', milestones: [] } },
    { id: 's1', title: 'Cahier des charges', priority: 1, parentId: 'p1', plan: { start: day(5), durDays: 3 } }
  ],
  tasks: [{ id: 't1', subjectId: 's1', title: 'Rédiger', deadline: null }],
  settings: { modules: { projet: true } }, ui: Object.assign({ pjOpen: 'p1' }, ui)
});

test('« Ouvrir l\'étape » depuis Projets amène sur le sujet surligné dans Sujets', async () => {
  const page = await openApp(projet(), { hash: 'projets' });
  await page.locator('#main [data-pj="open-step"][data-sid="s1"]').first().click();
  await page.waitForFunction(() => location.hash === '#sujets');
  await page.locator('#main .subject.open[data-sid="s1"].flash').waitFor();
  assert.deepEqual(page.errors, []);
});

test('« Nouvelle étape » depuis Projets amène sur la nouvelle étape surlignée dans Sujets', async () => {
  const page = await openApp(projet(), { hash: 'projets' });
  page.__prompt = 'Réception';
  await page.click('#main [data-pj="new-step"]');
  await page.waitForFunction(() => location.hash === '#sujets');
  const s = (await page.db()).subjects.find(x => x.title === 'Réception');
  await page.locator(`#main .subject.open[data-sid="${s.id}"].flash`).waitFor();
  assert.deepEqual(page.errors, []);
});

test('avec un filtre qui cache le sujet visé, « Ce sujet est masqué par un filtre » s\'affiche depuis Projets', async () => {
  const page = await openApp(projet({ dims: { code: 'ZZZ' } }), { hash: 'projets' });
  await page.locator('#main [data-pj="open-step"][data-sid="s1"]').first().click();
  await page.waitForFunction(() => location.hash === '#sujets');
  await page.locator('#toast .toast', { hasText: 'Ce sujet est masqué par un filtre' }).waitFor();
  assert.equal(await page.locator('#main .subject[data-sid="s1"]').count(), 0);
  assert.deepEqual(page.errors, []);
});

test('avec un filtre qui cache le sujet visé, « Ce sujet est masqué par un filtre » s\'affiche depuis le tableau de bord', async () => {
  const page = await openApp(donnees());
  // Le filtre Code change sans redessiner (autre onglet, synchro) : la ligne du tableau de bord est encore là
  await page.evaluate(() => { window.todoApp.getData().ui.dims.code = 'ZZZ'; });
  await page.click('#main .task[data-tid="e"] [data-org-goto]');
  await page.waitForFunction(() => location.hash === '#sujets');
  await page.locator('#toast .toast', { hasText: 'Ce sujet est masqué par un filtre' }).waitFor();
  assert.equal(await page.locator('#main .subject[data-sid="q"]').count(), 0);
  assert.deepEqual(page.errors, []);
});
