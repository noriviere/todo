// Captures d'écran pour le corps d'une PR, en mode démo, au jour fixe des tests (TODAY), sur PC et sur téléphone (390 px).
//   node tests/captures.js <dossier> <écran> [<écran>…]
//   ex. : node tests/captures.js /mnt/project-files/demi-journee charge pointage
// Chaque écran (son adresse : dashboard, sujets, charge, pointage, projets, donnees…) donne <écran>-pc.png et <écran>-telephone.png.
// Une capture qui demande un geste (panneau ouvert, projet ouvert) importe capturer() et ouvre ses pages elle-même.
const fs = require('fs');
const path = require('path');
const { openApp, closeAll } = require('./helpers');

const FORMATS = {
  pc: { viewport: { width: 1280, height: 900 } },
  telephone: { viewport: { width: 390, height: 844 }, touch: true },
};

// Ouvre l'écran en démo à chaque format, attend le rendu et écrit les captures pleine page dans le dossier ; rend les chemins
async function capturer(dossier, ecran, { avant } = {}) {
  fs.mkdirSync(dossier, { recursive: true });
  const fichiers = [];
  for (const [nom, o] of Object.entries(FORMATS)) {
    const page = await openApp(null, { ...o, query: '?demo', hash: ecran });
    await page.locator('#main').waitFor();
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    if (avant) await avant(page, nom);
    if (page.errors.length) throw new Error(`${ecran} (${nom}) : ${page.errors.join(' ; ')}`);
    const f = path.join(dossier, `${ecran}-${nom}.png`);
    await page.screenshot({ path: f, fullPage: true });
    await page.context().close();
    fichiers.push(f);
  }
  return fichiers;
}

if (require.main === module) {
  const [dossier, ...ecrans] = process.argv.slice(2);
  if (!dossier || !ecrans.length) {
    console.error('Usage : node tests/captures.js <dossier> <écran> [<écran>…]');
    process.exit(2);
  }
  (async () => {
    try {
      for (const e of ecrans) for (const f of await capturer(path.resolve(dossier), e.replace(/^#/, ''))) console.log(f);
    } finally {
      await closeAll();
    }
  })().catch(e => { console.error(e.message); process.exit(1); });
}

module.exports = { capturer, FORMATS };
