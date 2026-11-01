// Ouvre l'appli (index.html en file://) dans Chromium avec des données de départ dans localStorage.
const path = require('path');
const { chromium } = require('playwright');
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const KEY = 'todo-noel-v1';
// Jour fixe des tests : l'appli lit la date du jour (retards, Gantt), et les données de test ont des dates en dur
const TODAY = '2026-10-28';
const noon = ymd => new Date(ymd + 'T12:00:00');
const M = require('../metier.js');
// Fabricants de données de test : un sujet ou une tâche complets (champs par défaut de metier.js), à compléter par o
const sujet = (o = {}) => M.normSubject(Object.assign({ id: 'S', title: 'Sujet' }, o));
const tache = (o = {}) => M.normTask(Object.assign({ subjectId: 'S' }, o));

let browser;
// Chromium en français, comme le navigateur de Noel : champs d'heure en 24 h, dates en jj/mm/aaaa. L'option locale de Playwright
// n'y change rien ; sous Linux, c'est la langue de l'environnement (LANGUAGE, LANG) qui compte, --lang sert ailleurs.
const LANCEMENT = { args: ['--lang=fr-FR'], env: { ...process.env, LANGUAGE: 'fr', LANG: 'fr_FR.UTF-8' } };
// url : une autre page que index.html (par exemple une copie aux scripts réordonnés)
// avant(page) : appelé avant le chargement de la page (accroches de test, comme le faux dépôt de la Synchro)
// Boîtes confirm()/alert() : acceptées, sauf si page.__dialogue(d) est posé (le test répond alors lui-même)
async function openApp(data, { hash = '', viewport = { width: 1280, height: 900 }, touch = false, query = '', today = TODAY, url = URL, avant } = {}) {
  browser = browser || await chromium.launch(LANCEMENT);
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage();
  page.setDefaultTimeout(4000);
  // L'horloge part de ce jour à 9 h puis avance normalement (minuteries comprises)
  await page.clock.install({ time: new Date(today + 'T09:00:00') });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => page.__dialogue ? page.__dialogue(d) : d.accept(page.__prompt || undefined));
  if (avant) await avant(page);
  if (data) await page.addInitScript(([k, v]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, [KEY, JSON.stringify(data)]);
  await page.goto(url + query + (hash ? '#' + hash : ''));
  page.errors = errors;
  page.db = () => page.evaluate(() => window.todoApp.getData());
  return page;
}
async function closeAll() { if (browser) await browser.close(); browser = null; }
const day = (n, from = noon(TODAY)) => { const d = new Date(from); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
// Échelle dessinée du Gantt de l'écran, en pixels par jour
const ppd = page => page.locator('#main .pj-gantt').evaluate(g => +g.dataset.ppd);

// Raccourci clavier Ctrl+<touche>, et clic hors de tout champ (pour que Ctrl+Z vise l'historique)
const ctrl = (page, k) => page.keyboard.press('Control+' + k);
const ailleurs = page => page.locator('body').click({ position: { x: 5, y: 5 } });
// Glisse la poignée ⠿ d'une ligne (tâche ou en-tête de sujet) jusqu'au point { x, y }.
// avantLacher(page) : appelé juste avant de lâcher (pour lire le trait d'insertion) ; lacher: false pour ne pas lâcher.
async function glisserPoignee(page, ligne, vers, { avantLacher, lacher = true } = {}) {
  await ligne.hover();
  const g = await ligne.locator('.org-grip').boundingBox();
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + 20, g.y + 10, { steps: 4 });
  await page.mouse.move(vers.x, vers.y, { steps: 8 });
  await page.mouse.move(vers.x, vers.y + 1);
  const r = avantLacher ? await avantLacher(page) : undefined;
  if (lacher) await page.mouse.up();
  return r;
}
// Déplie un sujet de l'onglet Sujets s'il est replié : son contenu (tâches, menu « Dans »…) n'existe qu'une fois ouvert.
// Sans lui, un sélecteur sur ce contenu attend jusqu'au délai (4 s). Autre voie : mettre l'id dans ui.expanded des données.
async function deplier(page, id) {
  const sujet = page.locator(`#main .subject[data-sid="${id}"]`);
  if (!(await sujet.evaluate(el => el.classList.contains('open')))) await sujet.locator('.s-head [data-act="toggle-subject"]').click();
  await page.locator(`#main .subject.open[data-sid="${id}"]`).waitFor();
}
// Ouvre un écran (onglet) de la page déjà chargée, par son adresse #<écran>
const aller = (page, ecran) => page.goto(page.url().replace(/#.*$/, '') + '#' + ecran);

/* ---------- Synchro : faux dépôt partagé par plusieurs appareils ---------- */
// Faux dépôt tenu par le test (en mémoire, côté Node), à la place de GitHub : il garde toutes ses versions,
// refuse une écriture faite sur une version périmée (comme le 409/422 de GitHub) et peut se dire public (prive = false).
// avantEcriture : fonction appelée une fois juste avant la prochaine écriture (pour écrire d'ailleurs entre lecture et écriture,
// ou faire attendre l'envoi).
function fauxDepot(donnees = null) {
  const copie = x => x == null ? x : JSON.parse(JSON.stringify(x));
  const depot = {
    prive: true, versions: [], lectures: 0, avantEcriture: null,
    dernier: () => depot.versions[depot.versions.length - 1] || null,
    donnees: () => depot.dernier() && copie(depot.dernier().donnees),
    // Écriture faite par un autre appareil, sans passer par une page
    pousser(d) { const version = 'v' + (depot.versions.length + 1); depot.versions.push({ version, donnees: copie(d) }); return version; },
    async lire() { depot.lectures++; return copie(depot.dernier()); },
    async ecrire(d, depuis) {
      if (depot.avantEcriture) { const f = depot.avantEcriture; depot.avantEcriture = null; await f(); }
      if ((depot.dernier() ? depot.dernier().version : null) !== depuis) return { conflit: true };
      return { version: depot.pousser(d) };
    }
  };
  if (donnees) depot.pousser(donnees);
  return depot;
}
// Configuration de Synchro d'un appareil déjà branché (dépôt et jeton fictifs) ; derniere : { sha, synced, at } d'une Dernière synchro
const SYNC_CFG = (derniere = {}) => Object.assign({ owner: 'exemple', repo: 'donnees-fictives', path: 'donnees.json', token: 'jeton-fictif', sha: null, synced: null, at: null }, derniere);
// Ouvre un appareil (contexte de navigateur à part, son propre localStorage) branché sur le faux dépôt.
// cfg : configuration de Synchro déjà enregistrée (null : pas encore branché) ; stockage : autres clés du localStorage
async function appareil(depot, data, { cfg = SYNC_CFG(), stockage = {}, dialogue, ...opts } = {}) {
  const page = await openApp(data, Object.assign({}, opts, {
    avant: async p => {
      if (dialogue) p.__dialogue = dialogue;
      await p.exposeFunction('__fauxDepot', (op, ...a) => op === 'lire' ? depot.lire() : op === 'ecrire' ? depot.ecrire(...a) : depot.prive);
      await p.addInitScript(([cles]) => {
        if (!sessionStorage.getItem('seeded-sync')) { for (const k in cles) localStorage.setItem(k, cles[k]); sessionStorage.setItem('seeded-sync', '1'); }
        // Accroche de test : la Synchro parle à ce dépôt au lieu de GitHub
        window.__depotDeTest = {
          lire: () => window.__fauxDepot('lire'),
          ecrire: async (d, depuis) => {
            const r = await window.__fauxDepot('ecrire', d, depuis);
            if (r.conflit) { const e = new Error('conflit d\'écriture'); e.conflit = true; throw e; }
            return r.version;
          },
          estPrive: () => window.__fauxDepot('prive')
        };
      }, [Object.assign(cfg ? { 'todo-noel-sync': JSON.stringify(cfg) } : {}, stockage)]);
    }
  }));
  await synchroFinie(page);
  return page;
}
// Attend la fin de la synchro en cours (☁ Synchro… disparaît de la barre latérale)
const synchroFinie = page => page.waitForFunction(() => { const el = document.getElementById('sync-side'); return !el || !el.textContent.includes('…'); });
// « Synchroniser maintenant » dans l'écran Données, puis attend la fin
async function synchroniser(page) {
  if (!page.url().endsWith('#donnees')) await aller(page, 'donnees');
  await synchroFinie(page);
  await page.click('#main [data-act="sync-now"]');
  await synchroFinie(page);
}
// La tâche id telle qu'enregistrée dans la page
const lireTache = async (page, id) => (await page.db()).tasks.find(t => t.id === id);

module.exports = { sujet, tache, lireTache, openApp, closeAll, day, ppd, TODAY, ctrl, ailleurs, glisserPoignee, deplier, aller, fauxDepot, SYNC_CFG, appareil, synchroFinie, synchroniser };
