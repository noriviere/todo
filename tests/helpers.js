// Ouvre l'appli (index.html en file://) dans Chromium avec des données de départ dans localStorage.
const path = require('path');
const { chromium } = require('playwright');
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const KEY = 'todo-noel-v1';
// Jour fixe des tests : l'appli lit la date du jour (retards, Gantt), et les données de test ont des dates en dur
const TODAY = '2026-10-28';
const noon = ymd => new Date(ymd + 'T12:00:00');

let browser;
// url : une autre page que index.html (par exemple une copie aux scripts réordonnés)
async function openApp(data, { hash = '', viewport = { width: 1280, height: 900 }, touch = false, query = '', today = TODAY, url = URL } = {}) {
  browser = browser || await chromium.launch();
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage();
  page.setDefaultTimeout(4000);
  // L'horloge part de ce jour à 9 h puis avance normalement (minuteries comprises)
  await page.clock.install({ time: new Date(today + 'T09:00:00') });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept(page.__prompt || undefined));
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
module.exports = { openApp, closeAll, day, ppd, TODAY, ctrl, ailleurs, glisserPoignee, deplier };
