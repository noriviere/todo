// Termes « À éviter » du glossaire (CONTEXT.md) : aucun écran ne doit les afficher
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { openApp, closeAll, aller } = require('./helpers');

after(closeAll);

// Termes « À éviter » sans ambiguïté : aucun texte lu à l'écran ne les contient (pluriel compris)
const LISTE = ['deadline', 'date limite', 'inbox', 'tâches orphelines', 'workload', 'corbeille', 'suppression', 'supprimer',
  'retour arrière', "capacité d'une journée", 'objectif par jour', 'plugin', 'dashboard', 'fusion', 'merge',
  'catégorie', 'rattacher', 'détacher', 'arbre', 'projet séparé', 'objet projet', 'item', 'reste à faire', 'slot'];
// Termes « À éviter » hors du contrôle : l'écran les emploie à bon droit dans un autre sens (ou les données de l'utilisateur)
const EXCEPTIONS = {
  dossier: 'le dossier de la Sauvegarde et du fichier téléchargé, sur le PC',
  action: 'texte libre des sujets et tâches (« Plan d\'actions correctives » en démo)',
  ligne: '« ligne de tâche » (élément de l\'écran), « en ligne »',
  option: 'une option d\'un champ (« l\'option Répéter »), pas un module',
  planning: 'le Gantt est le planning d\'un projet ; seule la Charge ne doit pas s\'appeler ainsi',
  accueil: '« l\'écran d\'accueil » du téléphone',
};
const motif = t => t.replace(/'/g, "['’]");
const INTERDITS = new RegExp(`(?<!\\p{L})(?:${LISTE.map(motif).join('|')})[sx]?(?!\\p{L})`, 'iu');

// Termes « À éviter » de CONTEXT.md : avant un éventuel « ; » (une remarque suit), séparés par des virgules (hors parenthèses)
const glossaire = () => fs.readFileSync(path.join(__dirname, '..', 'CONTEXT.md'), 'utf8').split('\n')
  .filter(l => l.startsWith('_À éviter_'))
  .flatMap(l => l.replace(/^_À éviter_\s*:\s*/, '').split(';')[0].split(/,(?![^(]*\))/).map(t => t.trim()).filter(Boolean));

// Celui qui ajoute un terme « À éviter » tranche : contrôlé à l'écran, ou exception justifiée
test('chaque terme « À éviter » de CONTEXT.md sans précision entre parenthèses est contrôlé ou en exception', () => {
  const termes = glossaire();
  assert.ok(termes.length > 20, 'termes lus : ' + termes.join(', '));
  const oublies = termes.filter(t => !t.includes('(') && !LISTE.includes(t.toLowerCase()) && !(t.toLowerCase() in EXCEPTIONS));
  assert.deepEqual(oublies, [], 'à ajouter dans LISTE ou EXCEPTIONS de tests/termes.test.js : ' + oublies.join(', '));
  const nus = termes.map(t => t.replace(/\s*\(.*$/, '').toLowerCase());
  const perimes = [...LISTE, ...Object.keys(EXCEPTIONS)].filter(t => !nus.includes(t));
  assert.deepEqual(perimes, [], 'plus dans les termes « À éviter » de CONTEXT.md : ' + perimes.join(', '));
});

// Tout ce que l'utilisateur peut lire dans un élément : texte (replié compris), infobulles, libellés, options
const textes = (page, sel) => page.evaluate(sel => {
  const out = [];
  document.querySelectorAll(sel).forEach(racine => {
    const c = racine.cloneNode(true);
    c.querySelectorAll('script, style').forEach(n => n.remove());
    out.push(c.textContent);
    [racine, ...racine.querySelectorAll('*')].forEach(el => {
      for (const a of ['title', 'placeholder', 'aria-label']) if (el.getAttribute(a)) out.push(el.getAttribute(a));
    });
  });
  return out;
}, sel);

function verifier(lus, ou) {
  for (const t of lus) {
    const m = t.replace(/\s+/g, ' ').match(INTERDITS);
    assert.equal(m, null, m && `${ou} : « ${m[0]} » dans « …${m.input.slice(Math.max(0, m.index - 50), m.index + 50)}… »`);
  }
}

// Ouvre un écran par son adresse (#dashboard, #sujets…)

test('aucun écran, ni le panneau d\'une tâche, ni le guide n\'affiche un terme « À éviter » du glossaire', async () => {
  const page = await openApp(null, { query: '?demo' });
  const ecrans = await page.$$eval('.side .nav a[href^="#"]', as => as.map(a => a.getAttribute('href').slice(1)));
  assert.ok(ecrans.includes('charge') && ecrans.includes('projets') && ecrans.includes('pointage'), 'tous les modules actifs en démo : ' + ecrans);
  for (const e of ecrans) {
    await aller(page, e);
    await page.waitForTimeout(50);
    verifier(await textes(page, 'body'), 'écran ' + e);
  }
  // Ouvrir un projet du module Gestion de projet (Gantt, étapes)
  await aller(page, 'projets');
  await page.click('#main [data-pj="open-project"]');
  verifier(await textes(page, 'body'), 'projet ouvert');
  // Panneau d'une tâche, avec la répartition de la Charge et la Récurrence
  await aller(page, 'sujets');
  await page.locator('#main [data-act="details"]').first().click();
  assert.ok(await page.locator('#drawer select option[value="spread"]').count(), 'répartition de la Charge visible');
  verifier(await textes(page, '#drawer'), 'panneau d\'une tâche');
  await page.click('#drawer [data-act="close-drawer"]');
  // Le guide : toutes ses sections sont dans la page une fois ouvert ; un échec nomme la section
  await page.click('.gd-open');
  const sections = await page.$$eval('#guide [data-gd-sec]', ss => ss.map(s => s.id));
  assert.ok(sections.length > 10, 'sections du guide');
  verifier(await textes(page, '#guide .gd-head'), 'guide, en-tête');
  verifier(await textes(page, '#gd-top'), 'guide, accueil et sommaire');
  for (const id of sections) verifier(await textes(page, '#' + id), 'guide, section ' + id.replace(/^gd-/, ''));
  assert.deepEqual(page.errors, []);
});

// Chaque module ajoute ses blocs au panneau sans connaître ceux des autres : deux libellés ne doivent jamais se confondre
test('le panneau d\'une tâche n\'a jamais deux libellés de champ identiques, tous modules actifs', async () => {
  const page = await openApp(null, { query: '?demo' });
  await aller(page, 'sujets');
  await page.locator('#main [data-act="details"]').first().click();
  const libelles = await page.$$eval('#drawer .f > label', ls => ls.map(l => l.textContent.replace(/\s+/g, ' ').trim()));
  assert.ok(await page.locator('#drawer [data-pj-hard]').count() && libelles.includes('Répartition du travail'), 'blocs des modules présents : ' + libelles);
  const doublons = libelles.filter((l, i) => libelles.indexOf(l) !== i);
  assert.deepEqual(doublons, [], 'libellés en double dans le panneau : ' + doublons.join(', '));
  assert.deepEqual(page.errors, []);
});
