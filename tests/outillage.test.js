// Règles mécaniques du dépôt, vérifiées sur le texte des fichiers (voir CODING_STANDARDS.md)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..');
const lignes = f => fs.readFileSync(path.join(RACINE, f), 'utf8').split('\n');

// Sélecteur de page d'un test d'écran : il part d'une zone de l'écran. La feuille d'impression du Gantt (#pj-print)
// recopie des morceaux de #main ; un sélecteur nu peut donc viser la copie au lieu de l'écran.
const ZONES = /^\s*(#main|#drawer|#toast|#nav|#hist|#theme|#guide|#pj-print|#pj-page|body\b|\.app\b|\.side\b|\.gd-open\b)/;
const APPEL = /\bpage\.(locator|click|dblclick|fill|focus|hover|check|uncheck|selectOption|press|type|textContent|inputValue|getAttribute|isVisible|isChecked|waitForSelector|\$|\$\$|\$eval|\$\$eval)\(\s*(['"`])((?:(?!\2).)*)\2/g;

test('chaque sélecteur de page des tests part d\'une zone de l\'écran (#main, #drawer, #toast…)', () => {
  const fautes = [];
  for (const f of fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js'))) {
    lignes('tests/' + f).forEach((l, i) => {
      for (const m of l.matchAll(APPEL)) if (!m[3].split(',').every(s => ZONES.test(s))) fautes.push(`tests/${f}:${i + 1} « ${m[3]} »`);
    });
  }
  assert.deepEqual(fautes, [], 'préfixer par #main (ou la zone voulue) :\n' + fautes.join('\n'));
});

// Une règle de dates vit une seule fois, dans metier.js (calendrier commun) ; ces formes en sont des copies
const COPIES = [
  [/\[\s*1,\s*2,\s*3,\s*4,\s*5\s*\]/, 'semaine type : M.SEMAINE_TYPE ou A.calendrier().semaine'],
  [/\+\s*6\s*\)\s*%\s*7/, 'lundi de la semaine : A.lundi'],
  [/%\s*19\b/, 'calcul de Pâques : M.feries ou A.calendrier().ferie'],
];

test('aucune copie des règles de dates hors de metier.js', () => {
  const fichiers = ['index.html', ...fs.readdirSync(RACINE).filter(f => f.endsWith('.js') && f !== 'metier.js')];
  const fautes = [];
  for (const f of fichiers) lignes(f).forEach((l, i) => {
    for (const [motif, remede] of COPIES) if (motif.test(l)) fautes.push(`${f}:${i + 1} → ${remede}`);
  });
  assert.deepEqual(fautes, [], fautes.join('\n'));
});
