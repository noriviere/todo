# Sous-sujets et sujet en mode projet – design

Date : 2026-10-25 · Demandé et validé par Noel (fil projet, 19:35 à 19:41) · Remplace le modèle « projet séparé » de [2026-10-25-projets-gantt-design.md](2026-10-25-projets-gantt-design.md) ; tout le reste de ce document (planning, liens, jalons, Gantt, PDF) reste valable.

## En bref

Un seul type d'objet : le **sujet**. Il grandit en trois temps, sans rien recréer :

1. **Sujet simple** : des tâches.
2. **Sujet avec sous-sujets** : il contient des sous-sujets (un seul niveau) et garde ses propres tâches au niveau 1.
3. **Sujet en mode projet** (module Gestion de projet actif) : il apparaît dans l'onglet Projets, ses sous-sujets sont les étapes du Gantt, il porte les jalons, le chef de projet et la couleur. Il reste un sujet normal dans la todolist. Quitter le mode projet ne perd rien.

Exemple : « Achat machine » est d'abord un sujet, reçoit des sous-sujets (CDC, FAT, SAT…), puis passe en mode projet pour avoir le Gantt.

## Décisions de Noel

- Profondeur maximale : un sous-sujet ne contient que des tâches.
- Une tâche peut être transformée en sous-sujet (choix A) : le sous-sujet prend le titre de la tâche et **contient la tâche elle-même**, avec sa date, son statut, son temps passé et ses notes.
- Les tâches de niveau 1 d'un projet ne sont pas dans le Gantt ; elles comptent dans l'avancement global.
- Onglet Sujets : les sous-sujets s'affichent repliés sous leur parent. Le tableau de bord garde toutes les tâches à plat.

## Fonctionnel (cœur, sans module)

- Fiche d'un sujet : liste « Dans » (sujet principal, ou un sujet de premier niveau). Masquée si le sujet a lui-même des sous-sujets (« contient N sous-sujets »). Un sujet ne peut pas se ranger dans lui-même.
- Bouton « + Sous-sujet » en bas du corps d'un sujet de premier niveau.
- Détails d'une tâche : bouton « Transformer en sous-sujet ».
  - Tâche dans un sujet de premier niveau : sous-sujet de ce sujet.
  - Tâche dans un sous-sujet : nouveau sous-sujet du même parent (frère), pour respecter la profondeur.
  - Tâche de la boîte de réception : nouveau sujet de premier niveau.
  - Le sous-sujet hérite de la priorité et des code/secteur/produit du sujet d'où vient la tâche ; il s'ouvre et la tâche y est rangée.
- En-tête d'un sujet parent : état, avancement, retards, prochaine échéance et temps restant calculés sur **ses tâches et celles de ses sous-sujets**. Compteur « n sous-sujets ».
- Recherche et filtres Code/Secteur/Produit : un parent s'affiche si lui ou un de ses sous-sujets correspond.
- Listes déroulantes de sujet (tâche, ajout rapide, filtre du tableau de bord) : sous-sujets listés sous leur parent, préfixés « ↳ ». Le filtre « sujet » du tableau de bord sur un parent inclut les tâches de ses sous-sujets.
- Archiver un parent archive aussi ses sous-sujets actifs (marqués `archivedWithParent`) ; le restaurer les restaure.
- Aller à une tâche d'un sous-sujet depuis le tableau de bord déplie le parent et le sous-sujet.

## Fonctionnel (module Gestion de projet actif)

- Fiche d'un sujet de premier niveau : interrupteur « Mode projet ». Activé : chef de projet, couleur, lien « Ouvrir le planning ».
- Onglet Projets : les sujets actifs en mode projet. « + Nouveau projet » crée un sujet de premier niveau en mode projet. Le bouton d'archive de la carte retire le mode projet (le sujet et ses sous-sujets restent).
- Détail d'un projet : nom = titre du sujet ; « + Nouvelle étape » crée un sous-sujet.
- Fiche d'un sous-sujet dont le parent est un projet : début, durée, décalage, « Qui », « Commence après » (frères), comme avant.
- Avancement du projet = avancement du sujet parent (tâches de niveau 1 + sous-sujets).
- Un sous-sujet qui change de parent perd ses liens (`after`, `lagDays`) et disparaît des `before` des jalons de l'ancien parent.

## Données

| Où | Champ | Rôle |
| --- | --- | --- |
| sujet | `parentId` | Sujet parent (premier niveau), absent ou null sinon |
| sujet | `isProject` | Mode projet |
| sujet | `pj: {owner, color, milestones}` | Données du projet, gardées si le mode est retiré |
| sujet | `archivedWithParent` | Archivé par cascade |
| sujet | `plan`, `after`, `lagDays`, `who` | Étape (inchangés) |

- `db.projects` et `subject.projectId` disparaissent. Migration au chargement : chaque projet devient un sujet (même id, titre = nom, `isProject`, `pj` = chef, couleur, jalons, archivé si le projet l'était, priorité = la plus forte de ses étapes ou P2, code/secteur/produit repris s'ils sont communs à toutes ses étapes) ; chaque étape reçoit `parentId` = id du projet. Migration idempotente (si un sujet a déjà cet id, il reçoit seulement `isProject` et `pj`).
- Profondeur garantie à la lecture : un sujet dont le parent a lui-même un parent, ou dont le parent est introuvable, est traité comme un sujet de premier niveau.

## Hors périmètre

- Glisser-déposer pour changer de parent (la liste « Dans » suffit en V1).
- Sous-sujets à plus d'un niveau.
