// Petits « i » du mode d'emploi : chaque écran porte ses repères (data-repere), le guide y ajoute le « i ».
// Tour de tous les écrans et panneaux, modules allumés : la liste des « i » est figée (relevée avant les repères).
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { openApp, closeAll, day } = require('./helpers');

after(closeAll);

const aller = (page, ecran) => page.goto(page.url().replace(/#.*$/, '') + '#' + ecran);
const ZONE = { main: '#main', drawer: '#drawer' };

// Un « i » décrit par sa partie de l'aide et l'élément qui le contient (texte pour un titre, une case, un libellé)
const releve = (page, zone) => page.$$eval(ZONE[zone] + ' .gd-i', bs => bs.map(b => {
  const p = b.parentElement, tag = p.tagName.toLowerCase();
  const texte = /^(h1|h2|h3|summary|label|span)$/.test(tag) ? ' « ' + p.textContent.trim().replace(/\s+/g, ' ').slice(0, 24) + ' »' : '';
  return `${b.dataset.help} ← ${tag}${p.className ? '.' + p.className.split(' ')[0] : ''}${texte}`;
}));

// Chaque « i » vient d'un repère de l'écran : dans l'élément repéré, ou juste après lui (« après »)
const sansRepere = (page, zone) => page.$$eval(ZONE[zone] + ' .gd-i', bs => bs.filter(b => {
  const dedans = b.parentElement.dataset.repere, avant = b.previousElementSibling && b.previousElementSibling.dataset.repere;
  return !(dedans && dedans.split(' ')[0] === b.dataset.help && !dedans.includes(' après'))
    && !(avant && avant === b.dataset.help + ' après');
}).map(b => b.dataset.help));

const reperes = (page, zone) => page.$$eval(ZONE[zone] + ' [data-repere]', els => els.map(e => e.dataset.repere.split(' ')[0]));

// Liste figée sur le code d'avant les repères (table de sélecteurs du guide), démo, tous modules allumés
const DEMO = {
  dashboard: ['dashboard ← h1 « Tableau de bord »', 'saisie ← form.qa', 'pointer ← div.pt-today-l', 'filtres ← div.org-filters', "taches ← summary « Aujourd'hui43h50 estimée »"],
  sujets: ['sujets ← h1 « Sujets »', 'priorites ← div.prio-title'],
  projets: ['projets ← h1 « Projets »'],
  'projet ouvert': ['projets ← h3 « Jalons »'],
  charge: ['charge ← h1 « Charge de travail »', 'charge ← div.cc-legend', 'charge ← summary « Non comptées dans la cha »', 'creneaux ← h3 « Créneaux fixes »', 'creneaux ← h3 « Ma semaine type »'],
  'pointage semaine': ['pointer ← h1 « Pointage »', 'pointer ← span « Jour »'],
  'pointage conges': ['pointer ← h1 « Pointage »', 'conges ← h3 « Poser une absence »', 'compteurs ← h3 « Congés payés 2026 »', 'compteurs ← h3 « RTT 2026 »', 'conges ← h3 « Absences 2026 »', "types-absence ← summary « Types d'absence et droit »"],
  'pointage bilan': ['pointer ← h1 « Pointage »', 'bilan ← h3 « Heures par semaine »', 'bilan ← h3 « Par mois »', 'bilan ← h3 « Réglages »', 'pointage-import ← h3 « Importer un historique E »'],
  inbox: ['inbox ← h1 « Boîte de réception »', 'saisie ← form.qa'],
  archives: ['archives ← h1 « Archives »'],
  donnees: ['donnees ← h1 « Données »', 'modules ← h3 « Modules actifs »', 'calendrier ← h3 « Calendrier »', 'export ← h3 « Sauvegarde manuelle (exp »', 'export ← h3 « Restaurer (import JSON) »', 'excel ← h3 « Import depuis Excel »'],
  'panneau détails': ['details ← h2 « Détails de la tâche ✕ »', 'durees ← label « Temps estimé »', 'repartition ← label « Répartition du travail »', 'chrono ← label « Temps passé »', 'recurrence ← label « Répéter »']
};
// Hors démo : cartes Mode démo, sauvegarde automatique et synchro (absentes en démo)
const HORS_DEMO = {
  donnees: ['donnees ← h1 « Données »', 'demo ← h3 « Mode démo »', 'modules ← h3 « Modules actifs »', 'calendrier ← h3 « Calendrier »', 'sauvegarde-auto ← h3 « Sauvegarde automatique »', 'synchro ← h3 « Synchro PC ↔ téléphone »', 'export ← h3 « Sauvegarde manuelle (exp »', 'export ← h3 « Restaurer (import JSON) »', 'excel ← h3 « Import depuis Excel »']
};

// Ouvre chaque écran et panneau, et appelle voir(nom, zone) sur chacun
async function tour(page, voir, { demo = true } = {}) {
  const attendre = () => page.waitForTimeout(80);
  for (const e of demo ? ['dashboard', 'sujets', 'projets', 'charge', 'inbox', 'archives', 'donnees'] : ['donnees']) { await aller(page, e); await attendre(); await voir(e, 'main'); }
  if (!demo) return;
  await aller(page, 'projets'); await page.click('#main [data-pj="open-project"]'); await attendre(); await voir('projet ouvert', 'main');
  for (const t of ['semaine', 'conges', 'bilan']) {
    await aller(page, 'pointage'); await page.click(`#main [data-act="pt-tab"][data-t="${t}"]`); await attendre(); await voir('pointage ' + t, 'main');
  }
  await aller(page, 'sujets'); await page.locator('#main [data-act="details"]').first().click(); await attendre(); await voir('panneau détails', 'drawer');
}

const fictif = () => ({
  version: 1,
  subjects: [{ id: 's1', title: 'Dossier fictif', priority: 1 }],
  tasks: [{ id: 't1', subjectId: 's1', title: 'Tâche fictive', deadline: day(1), estimateMin: 60 }],
  settings: { modules: { projet: true } }, ui: { expanded: ['s1'] }
});

// Le tour en démo (écrans remplis), puis hors démo (cartes propres aux vraies données) ; voir(page, nom, zone, horsDemo)
async function deuxTours(voir) {
  const demo = await openApp(null, { query: '?demo' });
  await tour(demo, (nom, zone) => voir(demo, nom, zone, false));
  const vrai = await openApp(fictif());
  await tour(vrai, (nom, zone) => voir(vrai, nom, zone, true), { demo: false });
  assert.deepEqual([...demo.errors, ...vrai.errors], []);
}

test('tour des écrans et panneaux, modules allumés : chaque partie de l\'aide qui avait un « i » en a encore un, au même endroit', async () => {
  const vu = { demo: {}, horsDemo: {} };
  await deuxTours(async (page, nom, zone, hors) => { vu[hors ? 'horsDemo' : 'demo'][nom] = await releve(page, zone); });
  assert.deepEqual(vu, { demo: DEMO, horsDemo: HORS_DEMO });
});

test('chaque « i » vient d\'un repère de son écran, et chaque repère mène à une partie de l\'aide qui existe', async () => {
  const fautes = [];
  await deuxTours(async (page, nom, zone) => {
    const orphelins = await sansRepere(page, zone);
    if (orphelins.length) fautes.push(`${nom} : « i » sans repère : ${orphelins.join(', ')}`);
    const ids = await reperes(page, zone);
    if (!ids.length) fautes.push(`${nom} : aucun repère`);
    // Le guide ouvert contient une partie par identifiant (modules allumés)
    const manquants = await page.evaluate(ids => { const A = window.todoApp; A.guide.open('top'); const m = ids.filter(id => !document.getElementById('gd-' + id)); A.guide.close(); return m; }, ids);
    if (manquants.length) fautes.push(`${nom} : repère sans partie de l'aide : ${manquants.join(', ')}`);
  });
  assert.deepEqual(fautes, [], fautes.join('\n'));
});

test('cliquer un « i » ouvre la partie de l\'aide qui lui correspond, sur chaque écran', async () => {
  const page = await openApp(null, { query: '?demo' });
  const fautes = [];
  await tour(page, async (nom, zone) => {
    const n = await page.locator(ZONE[zone] + ' .gd-i').count();
    for (let i = 0; i < n; i++) {
      const b = page.locator(ZONE[zone] + ' .gd-i').nth(i);
      const id = await b.getAttribute('data-help');
      await b.click();
      const ouverte = await page.evaluate(() => { const s = document.activeElement.closest('#guide [data-gd-sec]'); return s && s.id; });
      if (ouverte !== 'gd-' + id) fautes.push(`${nom} : le « i » ${id} ouvre ${ouverte}`);
      await page.keyboard.press('Escape');
    }
  });
  assert.deepEqual(fautes, [], fautes.join('\n'));
  assert.deepEqual(page.errors, []);
});

test('les « i » de la Charge disparaissent avec le module et reviennent quand il est rallumé', async () => {
  const page = await openApp(fictif(), { hash: 'donnees' });
  const CHARGE = ['charge', 'creneaux', 'repartition'];
  const aides = async () => {
    const ids = [];
    for (const e of ['dashboard', 'sujets', 'projets', 'charge', 'pointage', 'inbox', 'archives', 'donnees']) { await aller(page, e); await page.waitForTimeout(50); ids.push(...await page.$$eval('#main .gd-i', bs => bs.map(b => b.dataset.help))); }
    await aller(page, 'sujets');
    await page.locator('#main [data-act="details"]').first().click();
    await page.waitForTimeout(50);
    ids.push(...await page.$$eval('#drawer .gd-i', bs => bs.map(b => b.dataset.help)));
    await page.keyboard.press('Escape');
    return ids;
  };
  await page.locator('#main [data-mod="charge"]').uncheck();
  assert.deepEqual((await aides()).filter(id => CHARGE.includes(id)), []);
  await aller(page, 'donnees');
  await page.locator('#main [data-mod="charge"]').check();
  assert.deepEqual([...new Set((await aides()).filter(id => CHARGE.includes(id)))].sort(), CHARGE);
  assert.deepEqual(page.errors, []);
});

test('le guide ne garde plus de table de sélecteurs pour placer ses « i »', () => {
  const guide = fs.readFileSync(path.resolve(__dirname, '..', 'guide.js'), 'utf8');
  assert.doesNotMatch(guide, /\bSPOTS\b/);
  assert.doesNotMatch(guide, /\[\s*'#(main|drawer)\b/, 'sélecteur d\'écran écrit dans le guide');
});
