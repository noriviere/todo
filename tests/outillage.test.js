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

// .githooks/pre-push, joué dans un dépôt jetable : refuse une branche qui ne contient pas origin/main
test('le hook pre-push refuse une branche en retard sur origin/main, accepte une branche à jour', () => {
  const { execFileSync, spawnSync } = require('child_process');
  const os = require('os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-push-'));
  // Lancé par le pre-commit d'une worktree, git hérite de GIT_DIR, GIT_INDEX_FILE… : sans ce nettoyage,
  // les commandes ci-dessous visent le vrai dépôt (core.bare=true écrit dans sa config partagée).
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
  const git = (dir, ...a) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8', env }).trim();
  const origine = path.join(tmp, 'origine.git'), clone = path.join(tmp, 'clone');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origine], { env });
  execFileSync('git', ['init', '-q', '-b', 'main', clone], { env });
  git(clone, 'remote', 'add', 'origin', origine);
  git(clone, 'commit', '-q', '--allow-empty', '-m', 'un');
  const ancien = git(clone, 'rev-parse', 'HEAD');
  git(clone, 'commit', '-q', '--allow-empty', '-m', 'deux');
  git(clone, 'push', '-q', '--no-verify', 'origin', 'main');
  const pousser = sha => spawnSync('sh', [path.join(RACINE, '.githooks', 'pre-push'), 'origin', origine],
    { cwd: clone, env, input: `refs/heads/x ${sha} refs/heads/x ${'0'.repeat(40)}\n`, encoding: 'utf8' });
  const refus = pousser(ancien);
  assert.equal(refus.status, 1);
  assert.match(refus.stdout, /Fusionne main d'abord/);
  assert.equal(pousser(git(clone, 'rev-parse', 'HEAD')).status, 0);
  fs.rmSync(tmp, { recursive: true, force: true });
});

// Un helper de test vit une fois, dans tests/helpers.js : un fichier de test l'importe au lieu d'en garder une copie.
// Seules les déclarations au niveau du fichier comptent (une variable locale d'un test peut porter le même nom).
test('aucun fichier de test ne redéfinit un nom exporté par tests/helpers.js', () => {
  const noms = Object.keys(require('./helpers'));
  const decl = new RegExp(`^(?:(?:const|let|var)\\s+(${noms.join('|')})\\s*=|(?:async\\s+)?function\\s*\\*?\\s*(${noms.join('|')})\\b)`);
  const fautes = [];
  for (const f of fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js'))) lignes('tests/' + f).forEach((l, i) => {
    const m = l.match(decl);
    if (m) fautes.push(`tests/${f}:${i + 1} « ${m[1] || m[2]} » → require('./helpers')`);
  });
  assert.deepEqual(fautes, [], fautes.join('\n'));
});

// Les fils de projet démarrent parfois sans .claude/settings.json (le hook SessionStart ne tourne pas) : les hooks Git
// restent alors éteints sans bruit. La suite le signale tout de suite, hors CI (la CI n'a pas besoin des hooks).
// Les worktrees (implement-spec) écrivent le chemin absolu du dossier : toute valeur qui y mène est acceptée.
test('les hooks Git du dépôt sont actifs (git config core.hooksPath .githooks)', { skip: !!process.env.CI }, () => {
  const { spawnSync } = require('child_process');
  const val = spawnSync('git', ['config', 'core.hooksPath'], { cwd: RACINE, encoding: 'utf8' }).stdout.trim();
  const reel = p => { try { return fs.realpathSync(p); } catch { return p; } };
  assert.ok(val && reel(path.resolve(RACINE, val)) === reel(path.join(RACINE, '.githooks')),
    `Hooks Git éteints (core.hooksPath = « ${val} ») : lance « git config core.hooksPath .githooks » à la racine du dépôt.`);
});

// La liste des améliorations repoussées est la première source quand on cherche des améliorations
test('AGENTS.md renvoie à la liste des améliorations repoussées, qui existe', () => {
  assert.ok(fs.existsSync(path.join(RACINE, 'docs/ameliorations-repoussees.md')));
  assert.ok(lignes('AGENTS.md').some(l => l.includes('docs/ameliorations-repoussees.md')));
});
