# Améliorations repoussées à plus tard

Liste tenue depuis le 1er novembre 2026. Chaque ligne dit d'où vient l'idée et où elle en est.
« Vérifié » veut dire que le point a été retrouvé dans le code du 1er novembre 2026 (b634846).

C'est la première source à lire quand on cherche des améliorations (revue d'architecture, rétro, passe de nettoyage).
Quand une revue, un grill, une rétro ou une PR repousse quelque chose, on ajoute une ligne dans la bonne section
avec le numéro suivant, l'origine (étape et date) et l'état. Quand un point est fait ou abandonné,
on le barre (`~~…~~`) et on note la PR ou la raison dans « État » ; on ne supprime pas la ligne.

## Architecture (pistes non lancées)

| # | Amélioration | Origine | État |
|---|---|---|---|
| 1 | ~~**Piste B** : la prévision de la Charge dans un fichier pur et testé, comme `projets-plan.js` ; `canWork` refait le calcul de `calendrier().travaille`~~ | Revue d'architecture du 01/11 | Fait, PR #66 : `charge-plan.js` testé sous Node, jours possibles = jours travaillés du calendrier commun |
| 2 | **Piste C** : les compteurs de congés N/N-1 et les stats du Pointage (semaines complètes, médiane) en fonctions pures testées ; déjà corrigés deux fois (PR #4, #6) sans test direct | Revue d'architecture du 01/11 | À lancer |
| 3 | **Piste D** : un seul lecteur Excel pour l'import de la to-do et celui du pointage (`serialDate`, `loadLib` copiés) | Revue d'architecture du 01/11 (spéculative) | À lancer ; en la faisant, retirer les deux lecteurs de `JOUR_MS_PERMIS` (`tests/outillage.test.js`) |
| 4 | Ne plus changer à la main la version du cache hors connexion (`sw.js`, `todo-noel-app-v12`) à chaque mise en ligne | Revue d'architecture du 31/10, candidat 6 (spéculatif) | Vérifié, toujours manuel |
| 27 | La **Récurrence** ne doit plus être un module activable : elle devient une fonction toujours active (retirée de « Modules actifs ») | Grill du rangement des fichiers, 01/11 (Q2, décision de Noel) | À lancer |

## Synchro

| # | Amélioration | Origine | État |
|---|---|---|---|
| 5 | **Fusion sujet par sujet** en cas de conflit PC / téléphone, au lieu de choisir une version entière | Revue du code du 24/10 ; repoussée encore au grill piste A (Q2) | Repoussée |
| 6 | ~~Une synchro reçue redessine l'écran pendant que tu tapes : le texte en cours de saisie est perdu~~ | Revue du code du 24/10 | Fait, PR #56 (piste A) : la version reçue attend la sortie du champ |
| 7 | Données au-delà de 1 Mo : envoi jamais testé | Revue du code du 24/10 | Non testé |
| 8 | Récurrence : une occurrence peut-elle être recréée en double quand une synchro arrive ? | Revue du code du 24/10 | À vérifier (le rattrapage après des données venues d'ailleurs existe depuis la piste 2) |
| 9 | La date du dernier export est partagée entre PC et téléphone (elle part dans la synchro) | Revue du code du 24/10 | Vérifié, toujours là |
| 25 | La question « GitHub vide » (et les messages de conflit) écrivent « 1 sujets » ou « 1 tâches » : `compte()` (`donnees/sync.js`) met toujours le pluriel | Rétro piste A, 01/11 | Repoussée |

## Charge, Chrono, Pointage

| # | Amélioration | Origine | État |
|---|---|---|---|
| 10 | ~~Capacité d'une journée toujours fixe (7 h), alors que le Pointage prévoit 7h45 du lundi au jeudi et 4 h le vendredi~~ | Revue du code du 24/10 | Fait, PR #61 : un seul horaire de la semaine type (Données › Calendrier) pour la Charge et le Pointage |
| 11 | Un chrono qui passe minuit est compté entièrement sur le jour de départ | Revue du code du 24/10 | À vérifier |
| 12 | Congés : un solde négatif (ex. −2 jours) est oublié au bout d'un an | Revue du code du 24/10 | À vérifier |
| 13 | Excel : les fichiers au format de dates « 1904 » (anciens Mac) donnent des dates fausses | Revue du code du 24/10 | Vérifié, non géré |
| 26 | Charge : lisser la surcharge, en reportant le travail d'un jour surchargé vers les jours libres (aujourd'hui la Charge montre la surcharge sans rien déplacer) | Grill piste B, 01/11 (Q7) | Repoussée |

## Gestion de projet

| # | Amélioration | Origine | État |
|---|---|---|---|
| 14 | Déplier une étape dans le Gantt pour voir ses tâches datées (la structure le permet déjà) | Conception du Gantt, 25/10 (hors V1) | Repoussée |
| 15 | Modèles de projet (étapes toutes prêtes) | Conception du Gantt, 25/10 (hors V1) | Repoussée |
| 16 | Export PDF : un jalon sans date peut faire planter le tri | Revue PR #10, 25/10 | Vérifié, toujours là (`modules/projets/projets.js:510`) |
| 17 | Export PDF : graduations trop serrées pour un projet très lointain | Revue PR #10, 25/10 | À vérifier |

## Téléphone et confort

| # | Amélioration | Origine | État |
|---|---|---|---|
| 18 | Barre d'onglets en bas de l'écran sur téléphone (7 onglets, au-delà des 5 conseillés) | Passe mobile, PR #7, 24/10 | Repoussée |
| 19 | Lignes de tâches plus compactes sur téléphone | Passe mobile, PR #7, 24/10 | Repoussée |
| 20 | Glisser-déposer sur une tâche terminée : rangement mal placé | Revue du code du 24/10 | À vérifier |
| 21 | Restaurer une sauvegarde sans sujets ne fait rien et n'affiche aucun message | Revue du code du 24/10 | À vérifier |
| 22 | Après « Rétablir », une tâche créée par la saisie rapide n'est ni retrouvée ni mise en surbrillance | Revue PR #29, 31/10 | À vérifier |

## Code (sans effet visible)

| # | Amélioration | Origine | État |
|---|---|---|---|
| 23 | `setTaskField` rend `true`, `false` ou un texte d'erreur : un résultat `{ ok, erreur }` serait plus clair | Revue PR #24, 31/10 | Repoussée |
| 24 | `modules/organisation/organisation.js` reconnaît une tâche « jamais touchée » par `createdAt === updatedAt`, ce qui est fragile | Piste 2, 31/10 | À vérifier |
