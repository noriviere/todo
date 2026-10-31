// Ouvre l'appli (index.html en file://) dans Chromium avec des données de départ dans localStorage.
const path = require('path');
const { chromium } = require('playwright');
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const KEY = 'todo-noel-v1';
// Jour fixe des tests : l'appli lit la date du jour (retards, Gantt), et les données de test ont des dates en dur
const TODAY = '2026-10-28';
const noon = ymd => new Date(ymd + 'T12:00:00');

let browser;
async function openApp(data, { hash = '', viewport = { width: 1280, height: 900 }, touch = false, query = '', today = TODAY } = {}) {
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
  await page.goto(URL + query + (hash ? '#' + hash : ''));
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
module.exports = { openApp, closeAll, day, ppd, TODAY, ctrl, ailleurs };
