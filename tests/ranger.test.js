// Ranger dans / sortir de (spec #40, ticket #41) : Gestion de projet nettoie ses liens d'étape et refuse de ranger
// un sujet en mode projet, même module désactivé ; le cœur ne connaît pas ces champs
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { openApp, closeAll, ctrl, ailleurs, deplier } = require('./helpers');
after(closeAll);

const donnees = projet => ({
  version: 1,
  subjects: [
    { id: 'p1', title: 'Presse', priority: 1, isProject: true,
      pj: { owner: '', color: '', milestones: [{ id: 'm1', name: 'Livraison', date: '2026-12-01', before: ['s1', 's2'] }] } },
    { id: 's1', title: 'Commande', priority: 1, parentId: 'p1', plan: { start: '2026-11-02', durDays: 2 }, after: ['s0'], lagDays: 2, who: 'Achats' },
    { id: 's2', title: 'Livraison', priority: 1, parentId: 'p1', plan: { durDays: 2 }, after: ['s1'] },
    { id: 's0', title: 'Devis', priority: 1, parentId: 'p1', plan: { durDays: 1 } },
    { id: 'q', title: 'Autre sujet', priority: 2 },
    { id: 'v', title: 'Projet vide', priority: 2, isProject: true, pj: { milestones: [] } }],
  tasks: [], settings: { modules: { projet } }, ui: { expanded: ['p1', 's1', 'q', 'v'] }
});
const sujetDe = (d, id) => d.subjects.find(s => s.id === id);

for (const projet of [true, false]) {
  const etat = projet ? 'actif' : 'désactivé';

  test(`sortir une étape de son projet nettoie ses liens (Gestion de projet ${etat}), Ctrl+Z les rend`, async () => {
    const page = await openApp(donnees(projet), { hash: 'sujets' });
    await page.locator('#main .subject[data-sid="s1"] [data-field="s-parent"]').selectOption('');
    let d = await page.db();
    const s1 = sujetDe(d, 's1');
    assert.equal(s1.parentId || null, null);
    assert.deepEqual([s1.after, s1.lagDays], [[], 0], 'prédécesseurs et décalage retirés');
    assert.deepEqual([s1.plan, s1.who], [{ start: '2026-11-02', durDays: 2 }, 'Achats'], 'durée, fin prévue et « Qui » gardés');
    assert.deepEqual(sujetDe(d, 's2').after, [], 'retirée des prédécesseurs de ses sœurs');
    assert.deepEqual(sujetDe(d, 'p1').pj.milestones[0].before, ['s2'], 'retirée des liens de jalon');
    await ailleurs(page);
    await ctrl(page, 'z');
    d = await page.db();
    assert.equal(sujetDe(d, 's1').parentId, 'p1');
    assert.deepEqual([sujetDe(d, 's1').after, sujetDe(d, 's1').lagDays, sujetDe(d, 's2').after], [['s0'], 2, ['s1']]);
    assert.deepEqual(sujetDe(d, 'p1').pj.milestones[0].before, ['s1', 's2']);
    assert.deepEqual(page.errors, []);
  });

  test(`un sujet en mode projet ne peut pas être rangé (Gestion de projet ${etat})`, async () => {
    const page = await openApp(donnees(projet), { hash: 'sujets' });
    const r = await page.evaluate(() => {
      const A = window.todoApp, v = A.subj('v'), q = A.subj('q');
      return { peut: A.canNest(v, q), range: A.modifier('test', () => A.setParent(v, 'q')) };
    });
    assert.equal(r.peut, false);
    assert.equal(r.range, false, 'setParent refuse');
    assert.equal(sujetDe(await page.db(), 'v').parentId || null, null);
    assert.equal(await page.locator('#main .subject[data-sid="v"] [data-field="s-parent"]').count(), 0, 'pas de menu « Dans » sur un projet');
  });
}

test('ranger une étape d\'un projet dans un autre : elle perd ses liens dans l\'ancien projet', async () => {
  const page = await openApp(donnees(true), { hash: 'sujets' });
  await page.evaluate(() => { const A = window.todoApp; A.modifier('test', () => A.setParent(A.subj('s1'), 'v')); });
  const d = await page.db();
  assert.equal(sujetDe(d, 's1').parentId, 'v');
  assert.deepEqual([sujetDe(d, 's1').after, sujetDe(d, 's1').lagDays, sujetDe(d, 's2').after], [[], 0, []]);
  assert.deepEqual(sujetDe(d, 'p1').pj.milestones[0].before, ['s2']);
});

test('archiver une étape garde ses liens', async () => {
  const page = await openApp(donnees(true), { hash: 'sujets' });
  await page.evaluate(() => { const A = window.todoApp; A.modifier('test', () => A.archiveSubject(A.subj('s1'))); });
  const d = await page.db();
  assert.equal(sujetDe(d, 's1').archived, true);
  assert.equal(sujetDe(d, 's1').parentId, 'p1');
  assert.deepEqual([sujetDe(d, 's1').after, sujetDe(d, 's2').after], [['s0'], ['s1']]);
  assert.deepEqual(sujetDe(d, 'p1').pj.milestones[0].before, ['s1', 's2']);
});

test('le cœur ne connaît plus les champs de Gestion de projet', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8') + fs.readFileSync(path.join(__dirname, '..', 'metier.js'), 'utf8');
  for (const champ of ['isProject', 'lagDays', '.pj', 'milestones', '.after'])
    assert.ok(!src.includes(champ), `le cœur cite encore « ${champ} »`);
});

test('deplier ouvre un sujet replié pour atteindre son menu « Dans », et laisse ouvert un sujet déjà ouvert', async () => {
  const page = await openApp(donnees(true), { hash: 'sujets' });
  const menu = id => page.locator(`#main .subject[data-sid="${id}"] [data-field="s-parent"]`);
  assert.equal(await menu('s2').count(), 0, 's2 est replié dans les données');
  await deplier(page, 's2');
  await deplier(page, 's1');
  assert.equal(await menu('s2').count(), 1);
  assert.equal(await menu('s1').count(), 1, 's1, déjà ouvert, ne s’est pas replié');
});
