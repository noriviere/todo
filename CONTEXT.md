# Ma To-Do

Appli web personnelle de Noel qui remplace une to-do list Excel : des sujets contenant des tâches avec échéances et temps de traitement, pour ne rien oublier et voir d'un coup d'œil ce qui est du jour et ce qui est en retard.

## Langage

### Sujets

**Sujet** :
Un thème de travail qui regroupe des tâches. Il porte une priorité (P1, P2 ou P3) ; son statut et son avancement sont calculés à partir de ses tâches, jamais saisis.
_À éviter_ : dossier, catégorie, projet (sauf en mode projet)

**Priorité P1 / P2 / P3** :
La priorité d'un sujet, affichée par couleur. P1 « Variable » impacte la rémunération variable, P2 « Important », P3 « Standard ». La priorité d'une tâche n'est pas saisie : elle vient de la proximité de son échéance.

**Sous-sujet** :
Un sujet rangé sous un autre sujet. Un seul niveau : un sous-sujet ne contient que des tâches. Le sujet parent garde aussi ses propres tâches.

**Ranger dans / sortir de** :
Ranger un sujet dans un autre en fait un sous-sujet ; l'en sortir le remet au premier niveau. Un sujet qui a des sous-sujets, ou en mode projet, ne peut pas être rangé. Une étape sortie de son projet perd ses prédécesseurs, son décalage et ses liens de jalon. Archiver un sous-sujet ne le sort pas de son parent.
_À éviter_ : rattacher, détacher, arbre ; « déplacer » est réservé au glisser-déposer

**Sujet en mode projet** :
Un sujet marqué « Projet » : il apparaît dans l'onglet Projets, ses sous-sujets deviennent des étapes et il porte les jalons. Ses tâches directes restent hors du Gantt et ne comptent que dans l'avancement global.
_À éviter_ : projet séparé, objet projet

### Tâches

**Tâche** :
Une action à faire, avec une échéance, un temps estimé et un temps réel. Statut : À faire, En cours (avec un pourcentage), En attente, Fait ou Annulé.
_À éviter_ : action, item, ligne

**Échéance** :
La date à laquelle une tâche doit être faite ; elle décide si la tâche est en retard, du jour, de demain…
_À éviter_ : deadline, date limite

**Temps estimé / temps réel** :
Le temps prévu pour une tâche, et le temps vraiment passé (mesuré par le chrono ou saisi à la main).

**Temps restant** :
Ce qu'il reste à passer sur une tâche ouverte : le temps estimé × la part qui reste si elle est en cours avec un pourcentage, sinon le temps estimé moins le temps réel. Jamais négatif : une tâche qui a dépassé son estimation n'a plus de temps restant. Le même chiffre partout (carte sujet, Charge).
_À éviter_ : reste à faire, temps estimé (pour ce chiffre)

**Boîte de réception** :
L'endroit des tâches qui n'ont pas encore de sujet ; on les range dans un sujet plus tard.
_À éviter_ : inbox, tâches orphelines

**Archive** :
Là où vont les sujets et les tâches dont on ne veut plus : rien n'est jamais supprimé.
_À éviter_ : corbeille, suppression

**Annuler** :
Revenir aux données d'avant une modification, la plus récente d'abord, en remontant l'historique de la session (Ctrl+Z, ou le bandeau qui confirme certaines modifications). Annuler ramène à l'endroit où la modification a été faite. Les données seulement : l'affichage (sujets dépliés, filtres, recherche) ne bouge pas. Ce n'est pas une suppression : annuler la création d'un sujet vide le fait disparaître, puisqu'il n'existait pas l'instant d'avant. Annuler défait aussi ce que la modification a entraîné (l'occurrence suivante d'une récurrence). L'historique se vide dès que des données arrivent d'ailleurs (synchro, autre onglet, restauration d'une sauvegarde JSON) ; un import Excel ou de pointage, lui, s'annule d'un coup.
_À éviter_ : supprimer, retour arrière

### Calendrier

**Semaine type** :
L'horaire normal de chaque jour de la semaine (chez Noel 7h45 du lundi au jeudi, 4h le vendredi), réglé une fois pour toute l'appli, quels que soient les modules actifs. Un jour à 0h n'est pas dans la semaine type. La Charge en tire la capacité de chaque jour, le Pointage son objectif.
_À éviter_ : capacité d'une journée, objectif par jour (deux réglages séparés, fondus en un seul)

**Journée pleine** :
Le plus long horaire de la semaine type. C'est ce que vaut « 1j » dans une durée ; une demi-journée de congé retire la moitié d'une journée pleine, sauf un jour dont l'horaire ne dépasse pas les trois quarts d'une journée pleine : ce jour est déjà une demi-journée (le vendredi à 4h), et la demi-journée de congé le libère entièrement.

**Jour férié** :
Un jour férié français, reconnu automatiquement (la case peut se décocher). Il n'est jamais ouvré.

**Jour ouvré** :
Un jour de la semaine type qui n'est pas férié. Il est le même pour tout le monde : les durées et dates du Gantt se comptent en jours ouvrés.
_À éviter_ : jour ouvrable (du lundi au samedi en droit du travail, pas utilisé ici), jour travaillé (pour ce sens)

**Jour travaillé** :
Un jour ouvré où Noel est là, sans congé ni absence d'une journée entière. C'est la réalité de son agenda : la Charge, la Récurrence et l'objectif du Pointage s'en servent.
_À éviter_ : jour ouvré (pour ce sens)

**Jour calendaire** :
N'importe quel jour, week-ends et fériés compris (certains types d'absence se décomptent ainsi, comme le congé paternité).

### Modules

**Module** :
Une fonction optionnelle qu'on active ou désactive dans « Modules actifs » : Chrono, Charge, Pointage et congés, Récurrence, Gestion de projet. L'appli fonctionne entièrement sans eux.
_À éviter_ : plugin, option

**Chrono** :
Le bouton ▶ d'une tâche qui mesure le temps réel passé.

**Charge** :
La prévision jour par jour du travail à venir, à partir des temps estimés, comparée à la capacité de chaque jour. Une tâche peut être répartie sur plusieurs jours.
_À éviter_ : planning, workload

**Créneau fixe** :
Un temps réservé qui revient (réunion, point d'équipe…) et qui prend sur la capacité de la Charge ce jour-là.
_À éviter_ : slot, réunion (pour le terme général)

**Pointage et congés** :
Les heures d'arrivée, de repas et de départ, les absences et les compteurs de congés. Les absences réduisent la capacité de la Charge.

**Temps pointé** :
Le temps de présence d'un jour : de l'arrivée au départ, moins le repas. Un jour passé sans départ s'arrête au début du repas (la demi-journée du vendredi, pointée « Pause déjeuner » sans retour) ; sans départ ni repas, il compte 0. Une correction après coup suit la même règle.

**Semaine complète** :
Une semaine finie dont chaque jour de la semaine type a du temps pointé, sans absence ni férié, quel que soit le total. Seules les semaines complètes entrent dans la moyenne et la médiane du Bilan ; les heures d'un jour hors semaine type comptent dans le total sans rien changer.

**Récurrence** :
Une tâche qui se recrée toute seule (chaque jour travaillé, semaine, mois, année) quand la précédente est faite. Si l'occurrence suivante tombe un jour non travaillé, son échéance est décalée (au jour travaillé suivant par défaut, réglable), en repartant toujours de la date théorique : le décalage ne s'accumule pas.

**Gestion de projet** :
Le module des sujets en mode projet : étapes, jalons, Gantt et export PDF.

**Étape** :
Un sous-sujet d'un sujet en mode projet, placé dans le Gantt, avec ses prédécesseurs et sa fin prévue.

**Jalon** :
Une date clé d'un projet, signalée par une alerte quand les étapes la dépassent.

**Gantt** :
Le planning d'un projet en barres, une par étape, exportable en PDF.

### Filtres

**Code, Secteur, Produit fini** :
Les trois dimensions d'un sujet qui servent de filtre global (tableau de bord, Sujets, Charge). « Code » s'appelait « Projet » avant le module Gestion de projet.
_À éviter_ : projet (pour le code)

### Pages et données

**Tableau de bord** :
La page d'accueil : tâches en retard, du jour, de demain et plus tard, avec les filtres rapides.
_À éviter_ : dashboard, accueil

**Sujets** :
La page globale de tous les sujets, à la manière d'un tableau Jira.

**Synchro** :
La copie des données vers le dépôt GitHub privé `noriviere/todo-donnees`, pour retrouver la même liste sur le PC et le téléphone.

**Dernière synchro** :
La dernière version de GitHub que cet appareil a envoyée ou reçue. Elle sert de point de comparaison : on regarde ce qui a changé ici et sur GitHub depuis.

**Conflit de synchro** :
Les données ont été modifiées sur cet appareil et sur un autre depuis la dernière synchro. Une version entière gagne, au choix de Noel ; l'autre reste récupérable.
_À éviter_ : fusion, merge

**Sauvegarde** :
La copie automatique des données dans un dossier local choisi sur le PC.
_À éviter_ : export (réservé au fichier JSON téléchargé à la main)

**Mode démo** :
L'appli ouverte avec `?demo` sur des données fictives, sans toucher aux vraies données.
