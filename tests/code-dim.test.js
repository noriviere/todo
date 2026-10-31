const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, closeAll } = require('./helpers');
after(closeAll);

const base = subjects => ({ version: 1, subjects, tasks: [], settings: {}, ui: { dims: { projet: 'X' } } });

test('l\'ancien champ projet est repris dans code', async () => {
  const page = await openApp(base([{ id: 's1', title: 'A', priority: 1, projet: 'X' }]));
  const d = await page.db();
  assert.equal(d.subjects[0].code, 'X');
  assert.equal('projet' in d.subjects[0], false);
  assert.equal(d.ui.dims.code, 'X');
  assert.equal('projet' in d.ui.dims, false);
  assert.deepEqual(page.errors, []);
});

test('un code existant n\'est pas écrasé par un ancien projet', async () => {
  const page = await openApp(base([{ id: 's1', title: 'A', priority: 1, code: 'Y', projet: 'X' }]));
  const d = await page.db();
  assert.equal(d.subjects[0].code, 'Y');
});

test('le filtre s\'appelle Code et plus Projet', async () => {
  const page = await openApp(base([{ id: 's1', title: 'A', priority: 1, projet: 'X' }]), { hash: 'sujets' });
  const html = await page.content();
  assert.match(html, /Code/);
  assert.equal(await page.locator('#main [data-field="s-dim-code"], #main select[data-dim="code"], #main [data-k^="dim-code"]').count() > 0 || /dim-code|"code"/.test(html), true);
  assert.doesNotMatch(await page.locator('#main .dims, #main .s-dims').first().innerText().catch(() => ''), /Projet/);
});

test('la démo utilise Code', async () => {
  const page = await openApp(null, { query: '?demo', hash: 'sujets' });
  const d = await page.db();
  assert.ok(d.subjects.some(s => s.code));
  assert.ok(d.subjects.every(s => !('projet' in s)));
});
