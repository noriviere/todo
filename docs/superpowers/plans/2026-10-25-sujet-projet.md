# Sous-sujets et sujet en mode projet – plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (Noel a choisi l'exécution native). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un projet devient un sujet en mode projet ; les sujets peuvent contenir des sous-sujets (un niveau) ; une tâche peut devenir un sous-sujet.

**Architecture:** Le cœur (`index.html`) gère `parentId`, l'affichage imbriqué, les statistiques agrégées, l'archivage en cascade, la transformation tâche → sous-sujet et la migration de `db.projects`. `projets.js` lit les projets comme des sujets `isProject` et leurs étapes comme leurs sous-sujets.

**Tech Stack:** JS sans build, Playwright via `tests/helpers.js`, `node --test tests/*.test.js`.

**Spec:** `docs/superpowers/specs/2026-10-25-sujet-projet-design.md`

## Global Constraints

- Skills ui-ux-pro-max et superpowers ; garder l'esprit visuel actuel.
- Archiver, jamais supprimer.
- Module Projets désactivé : aucun interrupteur, onglet ni champ d'étape ; les sous-sujets restent disponibles.
- Profondeur maximale 1.

## Review Focus

- Sujet qui a des sous-sujets mis « Dans » un autre sujet : refusé (liste masquée) ; test dans Task 2.
- Parent archivé : ses sous-sujets et leurs tâches disparaissent du tableau de bord, et reviennent à la restauration ; test dans Task 2.
- Anciennes données avec `projects` (sauvegarde, synchro) : migrées sans perte, deux chargements donnent le même résultat ; test dans Task 1.
- Sous-sujet qui quitte un projet : liens et jalons nettoyés ; test dans Task 4.
- Recherche qui ne trouve qu'une tâche d'un sous-sujet : le parent et le sous-sujet s'affichent ouverts ; test dans Task 2.

---

### Task 1: Modèle et migration (`index.html`)

**Files:** Modify `index.html` (`normSubject`, `migrate`, helpers) · Test `tests/sous-sujets.test.js`

**Interfaces — Produces (sur `A`) :** `parentOf(s) -> subject|null` (parent valide de premier niveau), `childrenOf(s, {all}) -> subject[]` (actifs, ou tous avec `all`), `setParent(s, pid|null)`, `expandTo(sid)`, `archiveSubject(s, on)` (cascade).

- [ ] Test : données `{projects:[{id:'p1',name:'Achat',owner:'Moi',color:'#23915f',milestones:[{id:'m',name:'L',date:'2027-01-04',before:['a']}]}], subjects:[{id:'a',title:'CDC',priority:2,projectId:'p1',code:'X'},{id:'b',title:'FAT',priority:1,projectId:'p1',code:'X'}]}` → sujet `p1` titre « Achat », `isProject`, `pj.owner` « Moi », priorité 1, code « X » ; `a` et `b` ont `parentId:'p1'` et plus de `projectId` ; plus de `projects`. Recharger donne le même nombre de sujets.
- [ ] Implémenter, faire passer, commit.

### Task 2: Sous-sujets dans l'onglet Sujets (cœur)

**Files:** Modify `index.html` (`subjectStats`, `views.sujets`, `subjectBlock`, `subjectOptions`, `setSubjectField`, actions), `organisation.js` (filtre sujet, aller au sujet), `excel-import.js` (alerte Remplacer) · Test `tests/sous-sujets.test.js`

- [ ] Tests : sous-sujet rendu dans `.subject[data-sid=parent] .s-children .subject.child` ; en-tête du parent compte les tâches des enfants (`done/live`) ; liste « Dans » (`[data-field="s-parent"]`) range un sujet et est absente sur un parent ; « + Sous-sujet » (`data-act="add-child"`) crée un enfant ouvert ; archiver le parent cache les tâches des enfants du tableau de bord, restaurer les remet ; recherche d'une tâche d'enfant affiche parent et enfant ; option « ↳ » dans le sélecteur de sujet de la tâche.
- [ ] Implémenter, faire passer, commit.

### Task 3: Transformer une tâche en sous-sujet

**Files:** Modify `index.html` (tiroir, action `to-subject`) · Test `tests/sous-sujets.test.js`

- [ ] Tests (3 cas de la spec) : tâche du parent → enfant du parent contenant la tâche (date et notes gardées) ; tâche d'un enfant → frère ; tâche de la boîte → sujet de premier niveau.
- [ ] Implémenter, faire passer, commit.

### Task 4: Projets = sujets en mode projet (`projets.js`)

**Files:** Modify `projets.js`, `projets.css`, `demo.js`, `guide.js`, `sw.js` · Tests : adapter `tests/projets-ui.test.js`, `tests/projets-fixes.test.js` au nouveau modèle ; ajouter cas dans `tests/sous-sujets.test.js`

- [ ] Tests : interrupteur « Mode projet » (`data-pjf="is-project"`) sur un sujet de premier niveau fait apparaître une carte dans Projets ; absent sur un sous-sujet et module coupé ; « + Nouveau projet » crée un sujet `isProject` ; un enfant qui change de parent perd `after` et sort des `before`.
- [ ] Remplacer `projects()/project()/stepsOf()` par des lectures de sujets, `p.name`→`p.title`, `p.owner/color/milestones`→`p.pj.*` ; champ « Projet » de l'étape supprimé (remplacé par « Dans ») ; démo : `pj1` devient un sujet avec une tâche de niveau 1 ; mode d'emploi mis à jour ; cache `v7`.
- [ ] Tous les tests passent, captures clair/sombre/mobile, commit, PR.
