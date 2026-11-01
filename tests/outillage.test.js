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

// La durée d'un jour en millisecondes sert à compter ou décaler des jours : M.diffDays / M.addDays (A.diffDays / A.addDays).
// Exceptions : les deux lecteurs Excel (date série d'Excel, à réunir par la piste D) et l'âge de la sauvegarde (backup.js).
const JOUR_MS = /\b(86400000|864e5|8\.64e7)\b/;
const JOUR_MS_PERMIS = ['donnees/excel-import.js', 'modules/pointage/pointage-import.js', 'donnees/backup.js'];

// Les fichiers de l'appli, dans tous leurs dossiers (hors tests, bibliothèques tierces, docs et outillage)
const HORS_APPLI = new Set(['.git', '.github', '.githooks', '.claude', 'tests', 'vendor', 'docs', 'node_modules']);
const fichiersAppli = (ext, dossier = '') => fs.readdirSync(path.join(RACINE, dossier), { withFileTypes: true }).flatMap(e => {
  const rel = dossier ? `${dossier}/${e.name}` : e.name;
  if (e.isDirectory()) return HORS_APPLI.has(e.name) ? [] : fichiersAppli(ext, rel);
  return e.name.endsWith(ext) ? [rel] : [];
});

test('aucune copie des règles de dates hors de metier.js', () => {
  const fichiers = ['index.html', ...fichiersAppli('.js').filter(f => f !== 'noyau/metier.js')];
  const fautes = [];
  for (const f of fichiers) lignes(f).forEach((l, i) => {
    for (const [motif, remede] of COPIES) if (motif.test(l)) fautes.push(`${f}:${i + 1} → ${remede}`);
    if (!JOUR_MS_PERMIS.includes(f) && JOUR_MS.test(l)) fautes.push(`${f}:${i + 1} → écart ou décalage de jours : A.diffDays / A.addDays`);
  });
  assert.deepEqual(fautes, [], fautes.join('\n'));
});

// Rangement (AGENTS.md) : la racine ne garde que la page, le service worker et le manifeste ; le code va dans les dossiers
// noyau/, modules/<module>/, donnees/, aide/.
test('aucun fichier .js ou .css à la racine, hors service worker', () => {
  const fautes = fs.readdirSync(RACINE).filter(f => /\.(js|css)$/.test(f) && f !== 'sw.js');
  assert.deepEqual(fautes, [], 'à ranger dans noyau/, modules/<module>/, donnees/ ou aide/ :\n' + fautes.join('\n'));
});

// Une feuille de styles ou une icône manquante ne fait échouer aucun test d'écran : chaque fichier appelé doit exister.
test('chaque fichier appelé par la page et par le manifeste existe', () => {
  const page = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
  const appels = [...page.matchAll(/\b(?:src|href)="([^"#$:]+)"/g)].map(m => m[1]);
  const manifeste = JSON.parse(fs.readFileSync(path.join(RACINE, 'manifest.webmanifest'), 'utf8'));
  appels.push(...manifeste.icons.map(i => i.src));
  assert.ok(appels.length > 10, 'appels lus : ' + appels.join(', '));
  const absents = appels.filter(f => !fs.existsSync(path.join(RACINE, f)));
  assert.deepEqual(absents, [], 'fichiers absents :\n' + absents.join('\n'));
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
// Le réglage est partagé par tous les worktrees du dépôt (implement-spec) : un chemin relatif mène au .githooks de chacun,
// un chemin absolu à celui d'un seul. Toute valeur qui mène au .githooks d'un worktree du même dépôt est acceptée.
test('les hooks Git du dépôt sont actifs (git config core.hooksPath .githooks)', { skip: !!process.env.CI }, () => {
  const { spawnSync } = require('child_process');
  const git = (...a) => spawnSync('git', a, { cwd: RACINE, encoding: 'utf8' }).stdout.trim();
  const val = git('config', 'core.hooksPath');
  const reel = p => { try { return fs.realpathSync(p); } catch { return p; } };
  const worktrees = git('worktree', 'list', '--porcelain').split('\n').filter(l => l.startsWith('worktree ')).map(l => l.slice(9));
  const communs = [RACINE, path.dirname(path.resolve(RACINE, git('rev-parse', '--git-common-dir'))), ...worktrees];
  const attendus = communs.map(w => reel(path.join(w, '.githooks')));
  assert.ok(val && attendus.includes(reel(path.resolve(RACINE, val))),
    `Hooks Git éteints (core.hooksPath = « ${val} ») : lance « git config core.hooksPath .githooks » à la racine du dépôt.`);
});

// La liste des améliorations repoussées est la première source quand on cherche des améliorations
test('AGENTS.md renvoie à la liste des améliorations repoussées, qui existe', () => {
  assert.ok(fs.existsSync(path.join(RACINE, 'docs/ameliorations-repoussees.md')));
  assert.ok(lignes('AGENTS.md').some(l => l.includes('docs/ameliorations-repoussees.md')));
});
