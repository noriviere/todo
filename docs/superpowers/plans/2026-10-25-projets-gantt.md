# Module Gestion de projet (Gantt) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un module optionnel « Gestion de projet » : projets, étapes (sujets rattachés) reliées par des dépendances, jalons avec alertes, Gantt live (bureau et mobile) et export PDF.

**Architecture:** Un fichier de calcul pur `projets-plan.js` (jours ouvrés, planning en cascade, alertes, cycles, lignes du Gantt), testé sous Node, et un fichier d'interface `projets.js` + `projets.css` branché sur `window.todoApp` comme `pointage.js`. `index.html` ne reçoit que de petits points d'accroche.

**Tech Stack:** JavaScript sans dépendance ni build, HTML/SVG, CSS ; `node --test` (Node 22) pour la logique ; Playwright préinstallé pour les vérifications navigateur.

**Spec:** `docs/superpowers/specs/2026-10-25-projets-gantt-design.md`

## Global Constraints

- Skills ui-ux-pro-max et superpowers à chaque changement ; garder l'esprit visuel actuel (couleurs, polices, composants `.btn`, `.card`, `.pill`).
- Aucune dépendance externe, aucun build : les fichiers sont servis tels quels (GitHub Pages, `file://`).
- Archiver, jamais supprimer.
- Module `projet` désactivé par défaut (`def: false`) ; désactivé, l'app est identique à aujourd'hui et les données projet restent intactes.
- Tous les champs ajoutés sont optionnels ; aucune migration destructive.
- Textes de l'interface en français.
- Seules les étapes et les jalons sont dessinés dans le Gantt.
- Les jalons ne bougent jamais automatiquement.

## Review Focus

1. **Champ Excel `projet` vs `projectId`** : un sujet a déjà une dimension texte `projet` (import Excel). Le nouveau sélecteur s'appelle « Rattacher au projet » et n'écrit que `projectId` ; l'import Excel ne touche jamais `projectId` (test Task 3).
2. **Références mortes** : `after`, `before` ou `projectId` pointant vers un sujet archivé, détaché ou inexistant sont ignorés sans erreur (test Task 1).
3. **Prédécesseur sans dates** : il est ignoré ; si plus aucun prédécesseur n'est planifié, l'étape prend son propre début, sinon elle est « à planifier » (test Task 1).
4. **Saisies limites** : début saisi un week-end → reporté au jour ouvré suivant ; `durDays` vide, 0 ou négatif → 1 ; `lagDays` négatif → 0 (test Task 1).
5. **Module désactivé avec des données projet** (synchro depuis un autre appareil) : aucun onglet, champ ou alerte visible, et rien n'est perdu à la sauvegarde (vérif Task 2).

---

### Task 1: Calcul pur du planning (`projets-plan.js`)

**Files:**
- Create: `projets-plan.js`
- Test: `tests/projets-plan.test.js`

**Interfaces:**
- Produces (exposé en `window.projetsPlan` dans le navigateur, `module.exports` sous Node) :
  - `nextWorkday(ymd: string, workDays: number[]) -> string` (renvoie `ymd` s'il est ouvré)
  - `addWorkdays(ymd: string, n: number, workDays: number[]) -> string` (n ≥ 0, ne compte que les jours ouvrés)
  - `schedule(steps: Step[], milestones: Milestone[], workDays: number[]) -> { byId: {[id]: {start, end}}, unplanned: string[], alerts: {milestoneId, subjectId}[], order: string[] }`
    - `Step = {id, plan?: {start?, durDays?}, after?: string[], lagDays?: number}` (seulement les étapes actives du projet)
    - `Milestone = {id, name, date, before?: string[]}`
  - `wouldCycle(steps: Step[], fromId: string, toId: string) -> boolean` (vrai si ajouter « `toId` commence après `fromId` » crée une boucle)
  - `buildRows(steps, sched, milestones) -> Row[]` avec `Row = {kind: 'etape'|'jalon'|'tache', id, parentId: null, start, end, depth: 0}` ; jalons d'abord (triés par date), puis étapes planifiées dans l'ordre topologique.
- Dates : chaînes `YYYY-MM-DD`, calcul en UTC (`Date.UTC`) pour éviter les décalages de fuseau.

- [ ] **Step 1: Write the failing tests** (`node:test` + `node:assert/strict`, `const P = require('../projets-plan.js')`, `WD = [1,2,3,4,5]`)
  - `nextWorkday('2026-10-24', WD) === '2026-10-26'` (samedi → lundi) ; `addWorkdays('2026-10-23', 1, WD) === '2026-10-26'`.
  - Chaîne simple : A `{start:'2026-11-02', durDays:5}`, B `{durDays:3, after:['A']}` → A `2026-11-02..2026-11-06`, B `2026-11-09..2026-11-11`.
  - Plusieurs prédécesseurs : SAT après FAT (fin `2026-11-20`), Racc (fin `2026-11-25`), Déch (fin `2026-11-18`) → SAT commence `2026-11-26`.
  - Décalage : B `lagDays:2` après A finissant le vendredi `2026-11-06` → B commence `2026-11-11`.
  - Limites : début `2026-10-24` → `2026-10-26` ; `durDays:0` → traité comme 1 ; `lagDays:-3` → 0.
  - Étape sans `start` ni prédécesseur → dans `unplanned` ; prédécesseur non planifié ignoré ; id inconnu dans `after` ignoré.
  - Jalon `{date:'2026-11-10', before:['B']}` avec B finissant `2026-11-11` → `alerts` contient `{milestoneId, subjectId:'B'}` ; fin le `2026-11-10` → pas d'alerte ; `before` avec id inconnu ignoré.
  - `wouldCycle` : A→B→C existant, ajouter « A après C » → `true` ; « C après A » → `false` ; « A après A » → `true`.
  - `buildRows` : jalon puis étapes, `kind` corrects, aucune ligne pour une étape non planifiée.

- [ ] **Step 2: Run to verify failure** — `node --test tests/` → FAIL (`Cannot find module '../projets-plan.js'`).

- [ ] **Step 3: Implement `projets-plan.js`** — IIFE qui assigne `window.projetsPlan` si `window` existe et `module.exports` sinon. `schedule` : tri topologique (Kahn) sur les `after` connus ; pour chaque étape, `start` = `nextWorkday(plan.start)` si aucun prédécesseur planifié, sinon `addWorkdays(max(fins), 1 + lag)` ; `end = addWorkdays(start, dur - 1)`. Les étapes prises dans un cycle (données corrompues) vont dans `unplanned`.

- [ ] **Step 4: Run tests** — `node --test tests/` → tous PASS.

- [ ] **Step 5: Commit** — `git add projets-plan.js tests/ && git commit -m "Projets : calcul du planning, jalons et cycles (testé)"`

### Task 2: Branchement du module, données et liste des projets

**Files:**
- Modify: `index.html` (entrée `MODULES` `projet` ; `migrate()` ; objet `hooks` ; balises `<link>`/`<script>`)
- Create: `projets.js`, `projets.css`
- Modify: `sw.js` (`CACHE = 'todo-noel-app-v6'`)

**Interfaces:**
- Consumes: `window.projetsPlan` (Task 1), `A.modOn`, `A.NAV`, `A.views`, `A.save`, `A.render`, `A.uid`, `A.esc`, `A.toast`.
- Produces dans `projets.js` : `on()` (= `A.modOn('projet')`), `projects()` (projets non archivés triés par `order`), `stepsOf(projectId)` (sujets actifs avec ce `projectId`), `projectSchedule(project) -> résultat de schedule()`, route `#projets` (liste) et `#projets/<id>` (détail). Nouveau hook `hooks.subjectBody: []` dans `index.html`, appelé dans `subjectBlock` juste après `.s-dims` avec `(s)`.

- [ ] **Step 1: index.html** — entrée `projet` : retirer `soon: true`, ajouter `def: false` ; `migrate()` : `d.projects = Array.isArray(d.projects) ? d.projects : []` ; ajouter `subjectBody: []` à `hooks` et `${hooks.subjectBody.map(f => f(s)).join('')}` après la ligne `.s-dims` ; charger `projets.css` dans le `<head>` et `projets-plan.js` puis `projets.js` après `organisation.js`.
- [ ] **Step 2: projets.js** — onglet `['projets', 'Projets', 'gantt', 'projet']` inséré après `sujets` (même méthode que `chrono-charge.js:377`) ; icône `gantt` ajoutée à `A.ICON` si absente. Vue liste : carte par projet (nom, responsable, avancement moyen pondéré par `subjectStats`, prochain jalon, pastille d'alerte si `alerts.length`), bouton « + Nouveau projet » (nom obligatoire via `prompt`, couleur par défaut), bouton archiver. Projet = `{id, name, owner:'', color, order, archived:false, archivedAt:null, createdAt, milestones:[]}`.
- [ ] **Step 3: Verify** (script Playwright en scratch sur `file://…/index.html`) : module off → pas d'onglet Projets, `#projets` retombe sur le tableau de bord ; données contenant `projects` + `projectId` → toujours présentes après une modification de tâche et `save()` (Review Focus 5) ; module on → onglet visible, création et archivage d'un projet. `node --test tests/` toujours vert.
- [ ] **Step 4: Commit** — `"Projets : module activable, données et liste des projets"`

### Task 3: Étapes (rattachement, planning, liens, responsable)

**Files:**
- Modify: `projets.js`, `projets.css`
- Test: `tests/projets-plan.test.js` (aucun ajout) ; vérification Playwright

**Interfaces:**
- Consumes: `hooks.subjectBody`, `wouldCycle`, `projectSchedule`.
- Produces : champs sujet `projectId`, `plan:{start, durDays}`, `after:[]`, `lagDays`, `who` ; `detachStep(subjectId)` qui vide ces champs et retire l'id des `after` des autres étapes et des `before` des jalons.

- [ ] **Step 1: Bloc « Étape de projet »** dans `subjectBody` (si `on()`) : sélecteur « Rattacher au projet » (— ou projets actifs). Si rattaché : début (date, masqué quand l'étape a des prédécesseurs, remplacé par « calculé : <date> »), durée en jours ouvrés, « Après : » en pastilles cochables des autres étapes du même projet, décalage en jours, « Qui » (`<input list>` alimenté par les `who` existants). Changement → `save()` puis rendu.
- [ ] **Step 2: Refus de cycle** : cocher une pastille qui ferait `wouldCycle` → la case revient décochée et `toast('Ce lien créerait une boucle entre étapes')`.
- [ ] **Step 3: « Nouvelle étape »** dans le détail projet : crée un sujet (priorité 3) avec `projectId`, puis ouvre-le dans Sujets déplié. Vider le sélecteur appelle `detachStep`.
- [ ] **Step 4: Verify** (Playwright) : rattacher un sujet existant, régler durée + « Après », voir la date calculée ; lien en boucle refusé ; détacher → liens nettoyés ; l'import Excel d'un sujet ayant `projet` texte ne crée pas de `projectId` (Review Focus 1).
- [ ] **Step 5: Commit** — `"Projets : étapes, dépendances et responsables"`

### Task 4: Jalons

**Files:** Modify: `projets.js`, `projets.css`

**Interfaces:** Produces : `project.milestones[] = {id, name, date, before:[]}` ; bandeau d'alerte `.pj-alert` dans le détail projet listant « <jalon> dépassé par <étape> ».

- [ ] **Step 1:** Section « Jalons » du détail projet : ajouter (nom + date), renommer, changer la date, pastilles « À finir avant » parmi les étapes, archiver (`archived:true`, exclu du calcul).
- [ ] **Step 2:** Bandeau d'alerte à partir de `projectSchedule(p).alerts` ; pastille d'alerte sur la carte du projet (Task 2).
- [ ] **Step 3: Verify** (Playwright) : allonger une étape listée dans un jalon → alerte affichée, date du jalon inchangée ; raccourcir → alerte disparue.
- [ ] **Step 4: Commit** — `"Projets : jalons et alertes de dépassement"`

### Task 5: Gantt bureau (lecture)

**Files:** Modify: `projets.js`, `projets.css`

**Interfaces:** Produces : `renderGantt(project, {scale: 'week'|'month', compact: boolean}) -> string` (HTML + SVG) qui ne dessine que `buildRows(...)` ; échelle mémorisée dans `db.ui.pjScale`.

- [ ] **Step 1:** Détail projet `#projets/<id>` : en-tête (nom, responsable, avancement, boutons échelle Semaine/Mois, « Exporter en PDF »), liste « À planifier » (`unplanned`, lien « Planifier » qui ouvre l'étape), puis le Gantt.
- [ ] **Step 2:** Gantt : colonne des noms (nom + « Qui »), frise avec graduations (lundi de chaque semaine ou 1er du mois), barre par étape remplie selon `subjectStats(s).progress`, couleur par responsable (palette fixe de 8 teintes, légende), losanges des jalons (rouges si alerte), flèches de dépendance en coude, ligne « aujourd'hui », étape en retard (fin < aujourd'hui et non terminée) bordée de `--late`.
- [ ] **Step 3:** Clic sur une barre ou un nom → `#sujets`, sujet déplié et défilé à l'écran.
- [ ] **Step 4: Verify** (Playwright, capture 1280 px) : données de démo de la Task 9 ou fixture équivalente ; les barres respectent les dates de `schedule` ; clic ouvre le bon sujet.
- [ ] **Step 5: Commit** — `"Projets : vue Gantt"`

### Task 6: Gantt bureau (édition directe)

**Files:** Modify: `projets.js`

- [ ] **Step 1:** Pointeur sur une barre sans prédécesseur : glisser horizontalement change `plan.start` (pas = 1 jour, aimanté au jour ouvré) ; poignée du bord droit sur toute barre : change `durDays` (min 1). Aperçu pendant le geste, sauvegarde au relâchement, puis recalcul en cascade.
- [ ] **Step 2:** Barre avec prédécesseurs : pas de déplacement (curseur normal, info-bulle « Placée par ses dépendances »).
- [ ] **Step 3:** Désactivé quand `(pointer: coarse)`.
- [ ] **Step 4: Verify** (Playwright `mouse.down/move/up`) : glisser A de 5 jours ouvrés décale B (dépendante) d'autant ; jalon inchangé ; alerte si dépassement.
- [ ] **Step 5: Commit** — `"Projets : déplacer et étirer les étapes dans le Gantt"`

### Task 7: Gantt mobile compact et vue liste

**Files:** Modify: `projets.js`, `projets.css`

- [ ] **Step 1:** Sous 760 px : colonne des noms de 110 px figée (`position: sticky`), frise en défilement horizontal centrée sur aujourd'hui à l'ouverture, lignes de 44 px minimum, appui sur une barre = ouverture de l'étape ; pas de glisser-déposer.
- [ ] **Step 2:** Bouton bascule « Gantt / Liste » (mémorisé dans `db.ui.pjMobileView`) ; la liste montre étape, qui, début, fin, avancement, alerte.
- [ ] **Step 3: Verify** (Playwright 390×844, `hasTouch`) : aucune barre de défilement horizontale de la page (seulement dans la frise), bascule fonctionnelle, appui ouvre l'étape.
- [ ] **Step 4: Commit** — `"Projets : Gantt compact et vue liste sur mobile"`

### Task 8: Export PDF

**Files:** Modify: `projets.js`, `projets.css`

- [ ] **Step 1:** « Exporter en PDF » : ajoute `body.pj-print` + une zone `#pj-print` (nom du projet, « Exporté le <date longue> », Gantt en `compact:false` échelle choisie, légende des responsables ; saut de page ; tableau Étape / Qui / Début / Fin / Avancement ; tableau Jalons Nom / Date / État) puis `window.print()` ; nettoyage sur `afterprint`.
- [ ] **Step 2:** `@media print` : `@page { size: landscape; margin: 12mm }`, tout masqué sauf `#pj-print`, texte ≥ 11 pt, couleurs imprimées (`print-color-adjust: exact`), `break-inside: avoid` sur lignes et tableaux, aucune tâche affichée.
- [ ] **Step 3: Verify** — Playwright `page.emulateMedia({media:'print'})` + `page.pdf({landscape:true})` en scratch : Gantt entier sur la page 1, tableaux lisibles, rien de coupé.
- [ ] **Step 4: Commit** — `"Projets : export PDF pour l'équipe"`

### Task 9: Échéance ferme, démo et mode d'emploi

**Files:** Modify: `projets.js`, `projets.css`, `demo.js`, `guide.js`

- [ ] **Step 1: Cadenas** (actif seulement si `on()`) : case « Échéance ferme » dans le panneau détails (`hooks.drawer`) → `task.hardDue = true` ; icône cadenas dans la ligne de tâche (`hooks.taskRow`) ; ligne en retard avec `hardDue` mise en avant (classe `.pj-hard`). Garde-fou : point `⚠` (info-bulle « Après la fin prévue de l'étape ») si `task.deadline` > fin calculée de son étape.
- [ ] **Step 2: Démo** : projet « Achat machine » avec étapes CDC, Validation d'étude, FAT, Raccordement électrique, Déchargement (Qui : sous-traitant), SAT, liens comme la spec, jalons « Livraison machine » (before FAT) et « Paiement 30 % » ; module `projet` activé dans les réglages de démo ; un dépassement de jalon visible.
- [ ] **Step 3: Guide** : section `{ id: 'projets', mod: 'projet', g: 'plan', title: 'Projets et Gantt' }` (étapes, liens, jalons, alertes, export PDF, mobile) et « i » sur l'onglet Projets.
- [ ] **Step 4: Verify** (Playwright) : `?demo` → onglet Projets, Gantt rempli, alerte visible ; guide sans section Projets quand le module est off ; `node --test tests/` vert.
- [ ] **Step 5: Commit** — `"Projets : échéance ferme, exemple de démo et mode d'emploi"`
