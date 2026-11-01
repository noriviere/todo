const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openApp, closeAll, glisserPoignee } = require('./helpers');
after(closeAll);

// Projet « Achat » avec 3 étapes, un autre sujet « Autre » (replié), un sujet P2
const data = () => ({
  version: 1,
  subjects: [
    { id: 'p', title: 'Achat', priority: 1, isProject: true, pj: { milestones: [{ id: 'm', name: 'Livraison', date: '2027-01-04', before: ['b'] }] } },
    { id: 'a', title: 'Étape A', priority: 1, parentId: 'p', order: 10 },
    { id: 'b', title: 'Étape B', priority: 1, parentId: 'p', order: 20, after: ['a'] },
    { id: 'c', title: 'Étape C', priority: 1, parentId: 'p', order: 30 },
    { id: 'o', title: 'Autre', priority: 1, order: 40 },
    { id: 'q', title: 'Sujet P2', priority: 2 }
  ],
  tasks: [], settings: {}, ui: { expanded: ['p'] }
});
const card = (page, id) => page.locator(`#main .subject[data-sid="${id}"]`).first();
const head = (page, id) => page.locator(`#main .subject[data-sid="${id}"] > .s-head`).first();
const order = page => page.evaluate(() => [...document.querySelectorAll('.subject[data-sid="p"] .s-children > .subject')].map(x => x.dataset.sid).join(''));

// Glisse la poignée de `id` jusqu'au point (x, y) ; renvoie l'état du trait juste avant de lâcher
async function drag(page, id, to, { drop = true } = {}) {
  return glisserPoignee(page, head(page, id), to, { lacher: drop, avantLacher: async page => ({
    line: await page.evaluate(() => {
      const l = document.querySelector('.org-line');
      return l && { zone: l.parentElement.className, rect: l.getBoundingClientRect().toJSON() };
    }),
    into: await page.evaluate(() => [...document.querySelectorAll('.org-into')].map(x => x.className))
  }) });
}
const gapBetween = async (page, x, y) => {
  const r1 = await card(page, x).boundingBox(), r2 = await card(page, y).boundingBox();
  return { x: r1.x + 60, y: (r1.y + r1.height + r2.y) / 2 };
};

test('sous-sujet : trait d\'insertion visible entre deux étapes, et dépôt à cette place', async () => {
  const page = await openApp(data(), { hash: 'sujets' });
  assert.equal(await order(page), 'abc');
  const { line } = await drag(page, 'c', await gapBetween(page, 'a', 'b'));
  assert.ok(line, 'un trait est affiché');
  assert.match(line.zone, /s-children/);
  const ra = await card(page, 'a').boundingBox(), rb = await card(page, 'b').boundingBox();
  assert.ok(line.rect.top >= ra.y + ra.height - 2 && line.rect.bottom <= rb.y + 2, 'le trait est dans l\'interstice');
  assert.equal(await order(page), 'acb');
  assert.deepEqual(page.errors, []);
});

test('sous-sujet : dépôt après la dernière étape', async () => {
  const page = await openApp(data(), { hash: 'sujets' });
  const rc = await card(page, 'c').boundingBox();
  const { line } = await drag(page, 'a', { x: rc.x + 60, y: rc.y + rc.height - 3 });
  assert.ok(line);
  assert.equal(await order(page), 'bca');
});

test('sous-sujet : lâcher à sa propre place ne change rien', async () => {
  const page = await openApp(data(), { hash: 'sujets' });
  const before = JSON.stringify((await page.db()).subjects);
  const ra = await card(page, 'a').boundingBox();
  await drag(page, 'a', { x: ra.x + 60, y: ra.y + 4 });
  assert.equal(JSON.stringify((await page.db()).subjects), before);
});

test('sous-sujet sur l\'en-tête d\'un autre sujet : rangé dedans, annulable', async () => {
  const page = await openApp(data(), { hash: 'sujets' });
  const ho = await head(page, 'o').boundingBox();
  const { into } = await drag(page, 'b', { x: ho.x + ho.width / 2, y: ho.y + ho.height / 2 });
  assert.equal(into.length, 1);
  let d = await page.db();
  const b = d.subjects.find(s => s.id === 'b');
  assert.equal(b.parentId, 'o');
  assert.deepEqual(b.after, []);
  assert.deepEqual(d.subjects.find(s => s.id === 'p').pj.milestones[0].before, []);
  await page.locator('#toast [data-act="undo"]').click();
  d = await page.db();
  assert.equal(d.subjects.find(s => s.id === 'b').parentId, 'p');
  assert.deepEqual(d.subjects.find(s => s.id === 'b').after, ['a']);
  assert.deepEqual(d.subjects.find(s => s.id === 'p').pj.milestones[0].before, ['b']);
  assert.equal(await order(page), 'abc');
});

test('sous-sujet : pas de dépôt hors d\'une liste de sous-sujets', async () => {
  const page = await openApp(data(), { hash: 'sujets' });
  const t = await page.locator('#main .prio-group[data-p="2"] .prio-title').boundingBox();
  const { line, into } = await drag(page, 'a', { x: t.x + 40, y: t.y + t.height / 2 });
  assert.equal(line, null);
  assert.equal(into.length, 0);
  assert.equal((await page.db()).subjects.find(s => s.id === 'a').parentId, 'p');
});

test('sujet de premier niveau : même trait, et changement de groupe de priorité', async () => {
  const page = await openApp(data(), { hash: 'sujets' });
  const rq = await card(page, 'q').boundingBox();
  const { line } = await drag(page, 'o', { x: rq.x + 60, y: rq.y + rq.height - 3 });
  assert.ok(line);
  assert.match(line.zone, /prio-group/);
  const o = (await page.db()).subjects.find(s => s.id === 'o');
  assert.equal(o.priority, 2);
  assert.ok(o.order > (await page.db()).subjects.find(s => s.id === 'q').order);
});
