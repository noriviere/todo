# Module « Gestion de projet » (Gantt) – design

Date : 2026-10-25 · Demandé par Noel · Récap de discussion : https://claude.ai/artifact/XPGFua5Txg5qVLYHFU4XRA

## En bref

Un module optionnel **intégré à l'app** (pas une app séparée) pour piloter les gros sujets comme des projets et les montrer à l'équipe sous forme de Gantt.

- Trois niveaux, pas plus : **Projet → Étapes → Tâches**. Une étape est un sujet de la todolist rattaché à un projet.
- **Seules les étapes et les jalons sont dessinés** dans le Gantt. Les tâches du quotidien (emails) restent dans l'étape et font avancer son pourcentage, sans apparaître.
- **Dates du Gantt sur l'étape**, dates des tâches = rappels de travail (inchangés). Un cadenas optionnel marque une date de tâche comme échéance ferme.
- **Liens « commence après »** entre étapes, plusieurs prédécesseurs possibles, plus un décalage en jours. Quand une étape glisse, les suivantes se **décalent automatiquement**.
- **Jalons** : dates fixes du projet (livraison machine, paiements intermédiaires), ni étape ni tâche, jamais déplacés automatiquement. Chaque jalon liste les étapes qui doivent être finies avant lui ; un dépassement lève une **alerte**. Le chef de projet arbitre puis ré-exporte.
- **Responsable** (« Qui ») par étape : entité ou personne.
- **Vue live** pour l'utilisateur, **export PDF** (Gantt + tableau des étapes + jalons) pour l'équipe, qui ne modifie rien.
- Module **désactivé par défaut** dans « Modules actifs » ; l'app reste complète et identique sans lui.

## Hors périmètre V1

- Tâches visibles dans le Gantt (la structure de rendu doit toutefois le permettre plus tard, voir « Rendu »).
- Modèles de projet réutilisables.
- Autres types de liens que fin → début.
- Édition par l'équipe, partage en ligne.

## Fonctionnel

### Projets

- Onglet « Projets » (visible seulement si le module est actif) : liste des projets non archivés avec nom, responsable, avancement, prochaine échéance de jalon, alerte éventuelle.
- Créer un projet : nom (obligatoire), responsable (facultatif), couleur.
- Archiver un projet (jamais de suppression). Archiver un projet ne touche pas à ses étapes, qui restent des sujets.
- Statut et avancement du projet dérivés de ses étapes (avancement pondéré comme pour un sujet, par les estimations des tâches).

### Étapes

- Créer une étape :
  1. depuis un sujet existant : champ « Projet » (liste déroulante) dans la fiche du sujet ;
  2. depuis le projet : bouton « Nouvelle étape », qui crée un sujet rattaché.
- Détacher une étape (vider le champ « Projet ») la rend à la todolist sans perte ; ses liens sont retirés.
- Champs propres à l'étape : début, durée en jours ouvrés (ou fin), « Après : » (pastilles des autres étapes du même projet), décalage en jours, « Qui ».
- Une étape garde tout ce qu'un sujet possède déjà : priorité P1/P2/P3, tâches, filtres projet/secteur/produit, archivage.
- Une étape sans dates n'est pas dessinée ; elle est listée en tête du Gantt avec un lien « Planifier ».

### Dates et échéances

- Les dates du Gantt ne sont jamais déduites des dates des tâches.
- Les dates des tâches restent des rappels et pilotent le tableau de bord comme aujourd'hui.
- Cadenas optionnel sur la date d'une tâche (`hardDue`) : affichage renforcé (icône cadenas) et mise en avant en retard.
- Garde-fou discret : un point d'attention sur une tâche dont la date dépasse la fin prévue de son étape.

### Liens et glissements

- Un seul type de lien : « commence après » (fin → début), plusieurs prédécesseurs.
- Début calculé = fin la plus tardive des prédécesseurs + décalage, en jours ouvrés (`settings.workDays`).
- Modifier une étape (dates, durée, liens) recalcule en cascade toutes les étapes dépendantes.
- Une étape sans prédécesseur garde le début saisi. Une étape avec prédécesseurs ne se déplace pas à la main : on change sa durée, son décalage ou ses liens.
- Un lien qui créerait une boucle est refusé avec un message clair.

### Jalons

- Créés dans le projet : nom, date, étapes à finir avant (pastilles).
- Losange dans le Gantt, sur une ligne dédiée en haut.
- Alerte si une étape listée finit après la date du jalon : jalon en rouge, étapes fautives signalées, bandeau d'alerte dans le projet et pastille sur la liste des projets.
- Les jalons ne bougent que si l'utilisateur les déplace.

### Vue Gantt (live)

- Une ligne par étape : nom, « Qui », barre de la durée prévue remplie selon l'avancement, couleur du responsable.
- Flèches de dépendance, losanges de jalons, ligne « aujourd'hui », étapes en retard (fin passée et non terminée) mises en évidence.
- Échelle semaine ou mois.
- Clic sur une barre : ouvre la fiche de l'étape (sujet) avec ses tâches.
- Glisser une barre sans prédécesseur la déplace ; étirer son bord droit change sa durée. Les dépendantes suivent.
- Mobile : Gantt aussi, en version compacte. Colonne des noms étroite et figée à gauche, frise défilante horizontalement (centrée sur aujourd'hui à l'ouverture), échelle semaine ou mois, lignes assez hautes pour le doigt. Appui sur une barre = fiche de l'étape ; pas de glisser-déposer des barres sur mobile (modification par la fiche). Un bouton bascule vers une vue liste des étapes (dates, qui, avancement, alertes).

### Export PDF

- Bouton « Exporter en PDF » sur un projet : feuille d'impression dédiée et `window.print()` en paysage ; l'utilisateur choisit « Enregistrer en PDF ».
- Page 1 : nom du projet, date d'export, Gantt avec jalons, légende des responsables.
- Page suivante si besoin : tableau des étapes (étape, qui, début, fin, avancement) et liste des jalons (nom, date, état).
- Lisibilité maximale : gros caractères, peu de couleurs, rien coupé entre deux pages, aucune tâche du quotidien.

## Technique

### Fichiers

- `projets.js` + `projets.css`, chargés après les modules existants dans `index.html`, sur le modèle de `chrono-charge.js` et `pointage.js` (hooks `window.todoApp`, événements `todo:rendered`, `todo:saved`, `todo:modules`).
- `index.html` : dans `MODULES`, retirer `soon: true` de l'entrée `projet` et ajouter `def: false` ; ajouter l'onglet avec `'projet'` en 4e élément de son entrée `NAV` ; tous les hooks du module testent `A.modOn('projet')`.
- `demo.js` : un projet d'exemple « Achat machine » (CDC, validation d'étude, FAT, raccordement électrique, déchargement, SAT, jalons livraison et paiement).
- `guide.js` : une section `mod: 'projet'` et des « i » sur l'onglet.
- `sw.js` : ajouter les nouveaux fichiers au cache si la liste est explicite.

### Données (tous les champs sont optionnels)

| Où | Champ | Rôle |
| --- | --- | --- |
| `db.projects[]` | `{id, name, owner, color, order, archived, createdAt, milestones}` | Projets |
| projet | `milestones: [{id, name, date, before: [subjectId]}]` | Jalons |
| sujet | `projectId` | Rattache le sujet (étape) ; absent = sujet normal |
| sujet | `plan: {start, durDays}` | Planning de l'étape |
| sujet | `after: [subjectId]`, `lagDays` | Dépendances et décalage |
| sujet | `who` | Responsable (texte libre, suggestions des valeurs déjà saisies) |
| tâche | `hardDue: true` | Date = échéance ferme |

- Aucune migration : la normalisation ajoute `projects: []` si absent ; un fichier sans ces champs se comporte exactement comme aujourd'hui.
- Les données transitent par la synchro et la sauvegarde existantes (`donnees.json`), sans changement.
- Détacher une étape retire son id des `after` des autres étapes et des `before` des jalons.

### Calcul du planning

- Par projet : tri topologique des étapes sur `after`. Pour chaque étape, `start` = saisi si aucun prédécesseur, sinon jour ouvré suivant la fin la plus tardive des prédécesseurs + `lagDays` ; `end` = `start` + `durDays` jours ouvrés − 1.
- Fonction pure `schedule(project, steps, workDays) → {byId: {start, end}, alerts: [...]}`, sans effet sur les données, testable isolément.
- Contrôle des jalons après calcul : pour chaque jalon, chaque étape de `before` dont `end` > `date` produit une alerte `{milestoneId, subjectId}`.
- Ajout d'un lien : refus si la cible est déjà un descendant de l'étape (détection de cycle).

### Rendu

- Gantt en HTML/SVG maison, sans bibliothèque.
- Le moteur dessine une liste générique de lignes `{kind: 'etape' | 'jalon' | 'tache', id, parentId, start, end, depth}`. La V1 ne produit que `etape` et `jalon` ; afficher plus tard les tâches d'une étape reviendra à générer des lignes `tache`.
- Feuille `@media print` dédiée pour l'export.

### Règles du projet

- Skills ui-ux-pro-max et superpowers à chaque changement ; garder l'esprit visuel actuel.
- Archiver, jamais supprimer.
- Module désactivé : aucun onglet, aucun champ, aucun hook visible ; les données restent intactes.

## Tests

- `schedule()` : chaîne simple, plusieurs prédécesseurs, décalage, jours non ouvrés, étape sans dates, alerte de jalon, cycle refusé.
- Vérification dans le navigateur (Playwright) : module off = app identique ; module on avec les données de démo = Gantt, glissement en cascade, alerte de jalon, aperçu d’impression lisible ; Gantt mobile compact (défilement, appui sur une barre, bascule liste).
