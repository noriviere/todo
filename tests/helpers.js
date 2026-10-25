// Ouvre l'appli (index.html en file://) dans Chromium avec des données de départ dans localStorage.
const path = require('path');
const { chromium } = require('playwright');
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const KEY = 'todo-noel-v1';

let browser;
async function openApp(data, { hash = '', viewport = { width: 1280, height: 900 }, touch = false, query = '' } = {}) {
  browser = browser || await chromium.launch();
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage();
  page.setDefaultTimeout(4000);
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
const day = (n, from = new Date()) => { const d = new Date(from); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
module.exports = { openApp, closeAll, day };
