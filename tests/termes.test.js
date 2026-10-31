// Termes « À éviter » du glossaire (CONTEXT.md) : aucun écran ne doit les afficher
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, closeAll } = require('./helpers');

after(closeAll);

const INTERDITS = /\b(deadline|inbox|workload|date limite)/i;

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
const aller = (page, ecran) => page.goto(page.url().replace(/#.*$/, '') + '#' + ecran);

test('aucun écran, ni le panneau d\'une tâche, ni le guide n\'affiche deadline, inbox, workload ou date limite', async () => {
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
