/* Mode d'emploi intégré.
   - Bouton « Mode d'emploi » dans la barre latérale (toujours au même endroit), raccourci « ? ».
   - Panneau qui s'ouvre par-dessus la page en cours : résumé des fonctions, sommaire, puis une section par sujet.
   - Petits « i » ajoutés à côté des titres, cases et boutons clés : ils ouvrent le guide sur la bonne section.
   Module séparé de index.html : il s'appuie sur window.todoApp et sur l'événement todo:rendered. */
(function () {
'use strict';
const A = window.todoApp;
if (!A) return;

const SVG = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const I_INFO = SVG('<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>');
const I_BOOK = SVG('<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5"/><path d="M9 7h6"/>');
const I_HELP = SVG('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.3"/><path d="M12 17h.01"/>');
const I_X = SVG('<path d="M18 6 6 18M6 6l12 12"/>');
const ic = k => (A.ICON[k] || '').replace('<svg', '<svg aria-hidden="true"');
const P = n => `<span class="gd-pill" style="background:var(--p${n}-bg);color:var(--p${n})">P${n}</span>`;
// Modules masqués (Données › Modules actifs) : leurs sections et leurs mentions disparaissent du guide
const on = m => !A.modOn || A.modOn(m);
const when = (m, html) => on(m) ? html : '';
const live = () => SECTIONS.filter(s => !s.mod || on(s.mod));
const see = all => { const ids = all.filter(id => live().some(s => s.id === id)); return ids.length ? `<p class="gd-see">Voir aussi : ${ids.map(id => `<button type="button" data-gd-to="${id}">${esc(byId(id).title)}</button>`).join(' · ')}</p>` : ''; };
const esc = A.esc;

/* ---------- Contenu ---------- */
// tab : onglet à ouvrir depuis la section ; ptTab : sous-onglet du Pointage
const GROUPS = [
  ['start', 'Pour commencer'],
  ['daily', 'Au quotidien'],
  ['organize', 'Organiser'],
  ['plan', 'Planifier sa charge'],
  ['pointage', 'Pointage et congés'],
  ['data', 'Données et appareils'],
  ['tips', 'Astuces']
];
const SECTIONS = [
  { id: 'premiers-pas', g: 'start', title: 'Premiers pas', html: () => `
    <p>Trois façons de démarrer :</p>
    <ul>
      <li><b>Reprendre ton Excel</b> : onglet Données, carte « Import depuis Excel ». Tes sujets et tâches arrivent avec leurs deadlines, temps et états.</li>
      <li><b>Partir de zéro</b> : crée tes sujets dans l'onglet Sujets, puis ajoute des tâches avec la saisie rapide.</li>
      <li><b>Voir un exemple</b> : le lien « Voir l'exemple » (en bas de la barre latérale ou dans Données) ouvre l'appli remplie de données fictives, sans toucher aux tiennes.</li>
    </ul>
    <p>Tout est enregistré automatiquement dans ce navigateur, à chaque modification. Il n'y a pas de bouton « Enregistrer ».</p>
    <p>Pour garder l'appli simple, tu choisis les fonctions affichées dans <b>Données › Modules actifs</b> (chrono, charge, pointage…).</p>
    <div class="gd-tip"><b>Sur téléphone</b> : ouvre l'appli dans le navigateur puis « Ajouter à l'écran d'accueil » pour l'avoir comme une vraie appli, même hors connexion. Pour retrouver les mêmes données que sur le PC, active la synchro.</div>
    ${see(['modules', 'excel', 'synchro', 'demo'])}`, tab: 'donnees' },

  { id: 'modules', g: 'start', title: 'Modules actifs', html: () => `
    <p>Onglet Données, carte <b>Modules actifs</b> : un interrupteur par fonction, pour n'afficher que ce qui te sert.</p>
    <ul>
      <li><b>Chrono et temps passé</b> : le bouton ▶ des tâches et le temps réel.</li>
      <li><b>Charge de travail</b> : l'onglet Charge, son mini graphique et les réglages de répartition.</li>
      <li><b>Pointage et congés</b> : l'onglet Pointage et son bandeau.</li>
      <li><b>Tâches récurrentes</b> : l'option Répéter.</li>
      <li><b>Gestion de projet</b> : « Mode projet » sur un sujet, l'onglet Projets (étapes, jalons, Gantt, export PDF) et le cadenas « échéance ferme ». Désactivé au départ.</li>
    </ul>
    <p>Sujets, tâches, tableau de bord, boîte de réception, archives et données restent toujours là. <b>Masquer un module ne supprime rien</b> : ses données sont gardées, sauvegardées et synchronisées, et réapparaissent quand tu le réactives. Si un chrono tourne au moment où tu masques le chrono, il est arrêté et son temps enregistré.</p>
    <p>Le choix est rangé avec tes données : il suit la synchro sur tes autres appareils. Ce mode d'emploi n'affiche que les modules actifs.</p>`, tab: 'donnees' },

  { id: 'dashboard', g: 'daily', title: 'Tableau de bord', html: () => `
    <p>La page d'accueil, pour voir d'un coup d'œil ce qui presse.</p>
    <ul>
      <li><b>Les 4 chiffres</b> en haut : tâches en retard, du jour, de demain, et à ranger (sans sujet). Un clic sur un chiffre amène à la liste correspondante.</li>
      <li><b>Les sections</b> : En retard, Aujourd'hui, Demain, 7 prochains jours, Plus tard, Sans deadline. Clique sur un titre pour replier ou déplier. À droite du titre : le temps estimé total de la section.</li>
      <li>Dans chaque section, les tâches sont classées par deadline, puis par priorité du sujet.</li>
      ${when('pointage', `<li><b>Le bandeau Pointage</b> (si tu travailles ce jour-là) montre ton heure d'arrivée et le bouton pour pointer.</li>`)}
      ${when('charge', `<li><b>La charge des 7 prochains jours</b> : mini graphique, un clic ouvre la vue Charge.</li>`)}
    </ul>
    <p>Le compteur rouge sur « Tableau de bord » dans le menu rappelle le nombre de tâches en retard, depuis n'importe quel onglet.</p>
    ${see(['saisie', 'taches', 'filtres'])}`, tab: 'dashboard' },

  { id: 'saisie', g: 'daily', title: 'Saisie rapide', html: () => `
    <p>La barre en haut du tableau de bord (et de la boîte de réception) sert à noter une tâche en quelques secondes.</p>
    <ul>
      <li>Tape le titre, choisis éventuellement un sujet, puis <b>Entrée</b> ou le bouton <b>Ajouter</b> (<b>+</b> sur téléphone).</li>
      <li>Les boutons <b>Auj.</b>, <b>Demain</b> et <b>+7 j</b> posent la deadline en un clic (re-clic pour l'enlever). Le champ date permet n'importe quel jour.</li>
      <li>Sans sujet, la tâche va dans la <b>boîte de réception</b>, à ranger plus tard.</li>
      <li>Le sujet choisi reste sélectionné pour la tâche suivante.</li>
    </ul>
    <div class="gd-tip"><b>Raccourci</b> : appuie sur <kbd>N</kbd> depuis n'importe quelle page pour aller directement dans la saisie rapide.</div>
    <p>Dans l'onglet Sujets, chaque sujet a aussi sa ligne « Ajouter une tâche » avec date et durée.</p>
    ${see(['inbox', 'durees'])}` },

  { id: 'taches', g: 'daily', title: 'Une ligne de tâche', html: () => `
    <p>Tout se modifie directement dans la ligne, sans ouvrir de fenêtre :</p>
    <ul>
      <li><b>La case</b> à gauche marque la tâche comme faite (un bouton « Annuler » apparaît quelques secondes en bas).</li>
      <li><b>Le titre</b> : clique dedans pour le corriger. Entrée valide, Échap annule.</li>
      <li><b>Le sujet</b> (pastille colorée) : change de sujet ou range une tâche de la boîte de réception.</li>
      <li><b>L'état</b> : À faire, En cours, En attente, Fait, Annulé. En cours affiche un champ <b>%</b> d'avancement ; 100 % la passe en Fait.</li>
      <li><b>La durée estimée</b> et <b>la deadline</b>. La date est écrite en clair (aujourd'hui, demain, dans 3 j, il y a 2 j…) : rouge si en retard, bleu si c'est aujourd'hui.</li>
      <li><b>+1j</b> reporte d'un jour (à partir d'aujourd'hui si la tâche est en retard).</li>
      <li>${when('chrono', '<b>▶</b> lance le chrono, ')}<b>⋯</b> ouvre les détails, la boîte <b>archive</b> la tâche.</li>
      <li>La barre de couleur à gauche rappelle la priorité du sujet : ${P(1)} ${P(2)} ${P(3)}, gris pour la boîte de réception.${when('recurrence', ' <b>↻</b> signale une tâche récurrente.')}</li>
    </ul>
    ${see(['details', 'chrono', 'glisser'])}` },

  { id: 'details', g: 'daily', title: 'Détails d\'une tâche', html: () => `
    <p>Le bouton <b>⋯</b> d'une tâche ouvre un panneau à droite avec tous ses champs :</p>
    <ul>
      <li><b>Titre, sujet, état, avancement</b>.</li>
      <li><b>Deadline</b>${when('charge', ' et <b>date de début</b> : la date de début sert à répartir le travail dans la vue Charge')}.</li>
      <li><b>Temps estimé</b>${when('chrono', ' et <b>temps réel passé</b> (le réel se remplit aussi avec le chrono)')}.</li>
      ${when('charge', '<li><b>Répartition du travail</b> : comment le temps restant est placé dans la vue Charge.</li>')}
      ${when('chrono', "<li><b>Temps passé</b> : chrono et ajout de temps à la main, avec l'historique.</li>")}
      ${when('recurrence', '<li><b>Répéter</b> : rend la tâche récurrente.</li>')}
      <li><b>Notes</b> : contexte, liens, prochaines étapes.</li>
      <li><b>Transformer en sous-sujet</b> : quand la tâche devient un petit dossier à découper.</li>
    </ul>
    <p>Échap ou un clic à côté ferme le panneau. Les dates de création, de modification et de fin sont notées en bas.</p>
    ${see(['repartition', 'chrono', 'recurrence', 'durees'])}` },

  { id: 'durees', g: 'daily', title: 'Écrire une durée', html: () => `
    <p>Partout où une durée est demandée (temps estimé, temps réel, créneaux, objectifs), tu peux écrire :</p>
    <ul>
      <li><code>1h30</code>, <code>1h</code>, <code>1.5h</code> : heures et minutes.</li>
      <li><code>45min</code> ou <code>45m</code> : minutes.</li>
      <li><code>2</code> : un nombre seul compte en <b>heures</b>.</li>
      <li><code>1j</code> : une journée de travail (la capacité réglée dans la vue Charge, 7h par défaut).</li>
    </ul>
    <p>Si la durée n'est pas comprise, un message le dit et rien n'est changé.</p>` },

  { id: 'chrono', mod: 'chrono', g: 'daily', title: 'Chrono et temps réel', html: () => `
    <ul>
      <li>Le bouton <b>▶</b> sur une ligne de tâche démarre le chrono ; il devient <b>■</b> avec le temps qui défile. Un clic l'arrête et ajoute le temps au réel.</li>
      <li>Un seul chrono tourne à la fois : en lancer un autre arrête le premier.</li>
      <li>Si un chrono a tourné plus de 4 h (oubli), l'appli demande de confirmer la durée à garder.</li>
      <li>Dans les détails, <b>+15min</b>, <b>+30min</b>, <b>+1h</b> ou une durée libre ajoutent du temps à la main, à la date choisie. Chaque ligne de l'historique peut être retirée.</li>
      <li>La jauge compare le réel à l'estimé ; elle passe en rouge si tu dépasses.</li>
    </ul>
    <p>Le temps réel déjà passé est retiré du temps restant dans la vue Charge.</p>` },

  { id: 'recurrence', mod: 'recurrence', g: 'daily', title: 'Tâches récurrentes', html: () => `
    <p>Dans les détails d'une tâche, <b>Répéter</b> propose : chaque jour travaillé, chaque semaine, toutes les 2 semaines, chaque mois, chaque trimestre, chaque année.</p>
    <p>Quand la tâche est faite (ou annulée), la suivante est créée automatiquement avec la prochaine deadline. Si tu l'as faite en retard, la nouvelle date saute directement à la prochaine échéance à venir.</p>
    <p>Une tâche récurrente porte le symbole <b>↻</b> dans sa ligne.</p>` },

  { id: 'filtres', g: 'daily', title: 'Filtres', html: () => `
    <p>Pour n'afficher qu'une partie des tâches sur le tableau de bord :</p>
    <ul>
      <li><b>${P(1)} ${P(2)} ${P(3)} À ranger</b> : une ou plusieurs priorités (re-clic pour retirer).</li>
      <li><b>Tous les sujets</b> : un seul sujet.</li>
      <li><b>Filtrer par mot</b> : cherche dans le titre, les notes et le nom du sujet.</li>
      <li><b>Code, Secteur, Produit fini</b> : les paramètres des sujets. Ce filtre-là s'applique aussi à l'onglet Sujets${when('charge', ' et à la vue Charge')}.</li>
    </ul>
    <p>« Effacer les filtres » ou « Tout afficher » remet tout. Sur téléphone, les filtres sont repliés derrière le bouton <b>Filtres</b> ; le chiffre sur le bouton dit combien sont actifs.</p>` },

  { id: 'sujets', g: 'organize', title: 'Sujets', html: () => `
    <p>Un sujet regroupe les tâches d'un même dossier. L'onglet Sujets les montre tous, comme un tableau de suivi, classés par priorité puis par urgence.</p>
    <ul>
      <li><b>La flèche</b> déplie le sujet : paramètres (Code, Secteur, Produit fini), description, tâches ouvertes, et une ligne pour ajouter une tâche.</li>
      <li><b>Le nom</b> se corrige en cliquant dedans.</li>
      <li>En un coup d'œil : tâches en retard ⚠, prochaine deadline ⏱, temps restant (estimé moins réel déjà passé, ou estimé × reste du % si la tâche est en cours${when('charge', ' : le même chiffre que dans la Charge')}), nombre de tâches faites, barre d'avancement.</li>
      <li><b>L'état du sujet</b> est calculé à partir de ses tâches (pondéré par leur durée estimée), tu n'as pas à le tenir à jour.</li>
      <li>La barre d'outils : recherche, « Afficher faites et annulées », Tout déplier / Tout replier, « + Nouveau sujet ».</li>
      <li>Les tâches faites ou annulées d'un sujet peuvent être archivées d'un coup avec « tout archiver ».</li>
    </ul>
    ${see(['sous-sujets', 'priorites', 'glisser', 'archives'])}`, tab: 'sujets' },

  { id: 'sous-sujets', g: 'organize', title: 'Sous-sujets', html: () => `
    <p>Quand un sujet grossit, découpe-le en <b>sous-sujets</b> (un seul niveau : un sous-sujet ne contient que des tâches). Le sujet garde ses propres tâches à côté.</p>
    <ul>
      <li><b>Créer</b> : « + Sous-sujet » en bas d'un sujet déplié.</li>
      <li><b>Ranger un sujet existant</b> dans un autre : liste <b>Dans</b> de sa fiche (« — Sujet principal » pour le ressortir).</li>
      <li><b>Transformer une tâche</b> : dans ses détails, « Transformer en sous-sujet ». Le sous-sujet prend son nom et contient la tâche, avec sa date, son temps passé et ses notes ; ajoute-lui d'autres tâches pour la découper.</li>
      <li>Le sujet parent compte les tâches de ses sous-sujets dans son avancement et ses retards. Le tableau de bord, lui, montre toujours toutes les tâches.</li>
      <li>Archiver un sujet archive aussi ses sous-sujets ; le restaurer les ramène.</li>
      ${when('projet', "<li>Pour avoir un planning Gantt, coche <b>Mode projet</b> dans la fiche du sujet : ses sous-sujets deviennent les étapes.</li>")}
    </ul>
    ${see(['sujets', 'projets'])}`, tab: 'sujets' },

  { id: 'priorites', g: 'organize', title: 'Priorités P1, P2, P3', html: () => `
    <ul>
      <li>${P(1)} <b>Variable</b> : impacte la rémunération variable.</li>
      <li>${P(2)} <b>Important</b>.</li>
      <li>${P(3)} <b>Standard</b>.</li>
    </ul>
    <p>La priorité se règle sur le sujet (pastille P1/P2/P3 dans son en-tête) et colore toutes ses tâches. La priorité d'une tâche, elle, vient de sa deadline : plus elle est proche, plus la tâche remonte.</p>` },

  { id: 'inbox', g: 'organize', title: 'Boîte de réception', html: () => `
    <p>Les tâches notées vite fait, sans sujet. Range-les ensuite avec la liste déroulante du sujet sur chaque ligne (ou par glisser-déposer sur un sujet).</p>
    <p>Le compteur dans le menu et la carte « à ranger » du tableau de bord rappellent combien il en reste.</p>`, tab: 'inbox' },

  { id: 'glisser', g: 'organize', title: 'Glisser-déposer', html: () => `
    <p>Attrape une tâche ou un sujet par la poignée <b>⋮⋮</b> (souris) :</p>
    <ul>
      <li><b>Tâche sur une autre tâche</b> : elle se place juste avant et prend sa deadline.</li>
      <li><b>Tâche sur l'en-tête d'un sujet</b> : elle est rangée dans ce sujet.</li>
      <li><b>Tâche sur une section</b> du tableau de bord (Aujourd'hui, Demain, 7 prochains jours, Sans deadline) : sa deadline change.</li>
      <li><b>Sujet</b> : un trait bleu montre où il va se poser, entre deux sujets. Posé dans un autre groupe P1/P2/P3, il prend cette priorité.</li>
      <li><b>Sous-sujet (étape)</b> : le même trait le place entre deux sous-sujets de son parent, ou dans la liste d'un autre sujet. Lâché sur l'en-tête d'un autre sujet, même replié, il y est rangé à la fin (ses liens « commence après » sont alors retirés, et Annuler les remet).</li>
    </ul>
    <p>Après un classement à la main, le bouton <b>Ordre auto</b> de l'onglet Sujets revient au tri par urgence.</p>` },

  { id: 'archives', g: 'organize', title: 'Archives', html: () => `
    <p>Rien n'est jamais supprimé : on archive. Une tâche ou un sujet archivé disparaît des listes mais reste dans l'onglet Archives, avec sa date d'archivage, et se restaure d'un clic.</p>
    <p>Archiver un sujet qui a encore des tâches ouvertes demande une confirmation. Juste après un archivage, « Annuler » en bas de l'écran le défait.</p>`, tab: 'archives' },

  { id: 'projets', mod: 'projet', g: 'plan', title: 'Projets et Gantt', html: () => `
    <p>Pour les gros sujets qui méritent une organisation de projet (achat de machine, chantier…). Un projet est un <b>sujet en mode projet</b> : ses <b>sous-sujets</b> sont les étapes, chacune avec ses tâches.</p>
    <ul>
      <li><b>Passer un sujet en projet</b> : dans sa fiche (onglet Sujets), coche « Mode projet ». Il reste dans la liste des sujets et apparaît dans l'onglet Projets. Le décocher ne perd rien.</li>
      <li><b>Créer un projet de zéro</b> : onglet Projets, « + Nouveau projet ».</li>
      <li><b>Les étapes</b> sont les sous-sujets du projet : « + Nouvelle étape » dans le projet, « + Sous-sujet » dans le sujet, ou la liste « Dans » d'un sujet existant. Les tâches du quotidien (emails…) n'apparaissent pas dans le Gantt, elles font juste avancer l'étape. Les tâches posées directement dans le sujet du projet comptent dans l'avancement global, hors Gantt.</li>
      <li><b>Planifier une étape</b> : un début, puis une durée en jours ouvrés ou directement la « Fin prévue » (la durée se recalcule), et « Qui » (Production, Entreprise A, un nom…). Les dates du Gantt sont celles de l'étape, pas celles des tâches, qui restent tes rappels.</li>
      <li><b>Commence après</b> : coche les étapes qui doivent être finies avant. Son début est alors calculé (plus un décalage éventuel). Quand une étape glisse, les suivantes se décalent toutes seules. Un lien qui ferait une boucle est refusé.</li>
      <li><b>Jalons</b> : dates fixes (livraison, paiements). Indique les étapes à finir avant chacun. Ils ne bougent jamais seuls : si une étape les dépasse, une <b>alerte</b> s'affiche ; à toi de décaler le jalon ou de réorganiser, puis de ré-exporter.</li>
      <li><b>Le Gantt</b> : une barre par étape, remplie selon l'avancement, flèches de dépendance, losanges des jalons, ligne d'aujourd'hui. Clic sur une barre pour ouvrir l'étape. À la souris, glisse une étape libre pour la déplacer ou étire sa fin pour changer sa durée.</li>
      <li><b>Zoom</b> : « Semaines » et « Mois » sont deux échelles prêtes ; <b>−</b> et <b>+</b> resserrent ou élargissent les mois à la volée (aussi Ctrl + molette, ou pincer à deux doigts sur téléphone), « Tout voir » fait tenir tout le projet dans l'écran. Le zoom est mémorisé.</li>
      <li><b>Avancement</b> : une petite jauge et le % sous le nom de chaque étape, lisibles même quand la barre est trop courte.</li>
      <li><b>Sur téléphone</b> : le Gantt défile horizontalement, les noms restent à gauche ; le bouton <b>Liste</b> affiche les mêmes infos ligne par ligne.</li>
      <li><b>Exporter en PDF</b> : une version imprimable pour l'équipe (Gantt, tableau des étapes et des jalons). Choisis « Enregistrer en PDF » dans la fenêtre d'impression.</li>
    </ul>
    <div class="gd-tip"><b>Échéance ferme</b> : dans les détails d'une tâche, coche « Échéance ferme » si sa date est une vraie échéance (cadenas dans la liste). Un ⚠ signale une tâche datée après la fin prévue de son étape.</div>`, tab: 'projets' },

  { id: 'charge', mod: 'charge', g: 'plan', title: 'Vue Charge', html: () => `
    <p>Prévision de ton temps de travail sur 7, 14 ou 28 jours.</p>
    <ul>
      <li><b>Le graphique</b> : une barre par jour, empilée par priorité (${P(1)} ${P(2)} ${P(3)}, gris pour la boîte de réception, hachuré pour les créneaux fixes, congés et fériés). Le trait horizontal est la capacité du jour ; une barre au-dessus signale une surcharge.</li>
      <li><b>Clique un jour</b> pour voir sous le graphique ce qui y est prévu et le temps libre ou en trop.</li>
      <li><b>Les chiffres</b> : charge du jour, des 7 jours face à ta capacité, nombre de jours en surcharge, tâches non comptées.</li>
      <li><b>Non comptées</b> : les tâches sans durée estimée, ou sans deadline (et sans temps par jour). Ajoute-leur ces infos pour qu'elles entrent dans le graphique.</li>
    </ul>
    <p>Le temps compté est le <b>temps restant</b> : estimé moins réel déjà passé (ou estimé × reste du % si la tâche est en cours).</p>
    ${see(['repartition', 'creneaux'])}`, tab: 'charge' },

  { id: 'repartition', mod: 'charge', g: 'plan', title: 'Répartition du travail', html: () => `
    <p>Dans les détails d'une tâche, trois façons de placer son temps restant :</p>
    <ul>
      <li><b>Tout le jour de la deadline</b> (par défaut).</li>
      <li><b>Réparti entre la date de début et la deadline</b> : le temps est étalé sur les jours travaillés. Sans date de début, on part d'aujourd'hui.</li>
      <li><b>Un temps fixe par jour</b> (ex. <code>2h</code>) jusqu'à épuisement ; la vue Charge prévient si ça finit après la deadline.</li>
    </ul>
    <p>Une tâche en retard est placée sur aujourd'hui. Les jours de congé, fériés ou entièrement pris par des créneaux fixes ne reçoivent pas de travail.</p>` },

  { id: 'creneaux', mod: 'charge', g: 'plan', title: 'Créneaux fixes et semaine type', html: () => `
    <p><b>Créneaux fixes</b> (vue Charge) : le temps pris par ce qui n'est pas une tâche, comme les réunions récurrentes. Il est retiré de ta capacité.</p>
    <ul>
      <li>Nom, durée, fréquence (chaque semaine, une semaine sur deux, chaque jour, un jour du mois, une seule fois…), jours de la semaine, dates de début et de fin.</li>
      <li>Un créneau s'archive et se restaure comme le reste.</li>
      ${when('pointage', '<li>Les congés posés dans Pointage et les jours fériés sont retirés automatiquement : pas besoin de créneau pour eux.</li>')}
    </ul>
    <p><b>Ma semaine type</b> : la capacité d'une journée (sert aussi pour écrire <code>1j</code>) et les jours travaillés.</p>`, tab: 'charge' },

  { id: 'pointer', mod: 'pointage', g: 'pointage', title: 'Pointer sa journée', html: () => `
    <p>Onglet Pointage, sous-onglet <b>Semaine</b> (et bandeau du tableau de bord) :</p>
    <ul>
      <li>Les boutons <b>Pointer l'arrivée</b>, <b>Pause déjeuner</b>, <b>Retour de pause</b>, <b>Pointer le départ</b> notent l'heure actuelle. Le total de la journée défile pendant que tu es là.</li>
      <li>Le tableau de la semaine permet de corriger chaque heure à la main, de marquer une absence (journée, matin ou après-midi) et d'ajouter une note.</li>
      <li>En bas : total de la semaine, objectif et écart. Les flèches ‹ › changent de semaine.</li>
    </ul>
    ${see(['conges', 'bilan'])}`, tab: 'pointage', ptTab: 'semaine' },

  { id: 'conges', mod: 'pointage', g: 'pointage', title: 'Poser un congé', html: () => `
    <p>Sous-onglet <b>Congés</b> :</p>
    <ul>
      <li><b>Poser une absence</b> : dates de début et de fin, type (congés payés, RTT, maladie…), journée ou demi-journée, puis <b>Poser</b>. Seuls les jours travaillés sont marqués : week-ends et fériés sont sautés.</li>
      <li><b>Absences de l'année</b> : la liste, regroupée par période, avec le total par type. ✕ retire une absence.</li>
      <li>Une absence posée à l'avance bloque ces jours dans la vue Charge.</li>
    </ul>
    ${see(['compteurs', 'types-absence'])}`, tab: 'pointage', ptTab: 'conges' },

  { id: 'compteurs', mod: 'pointage', g: 'pointage', title: 'Compteurs de congés', html: () => `
    <p>Pour chaque type qui a un compteur (congés payés, RTT…) : droits, jours pris, jours posés à venir et reste, en <b>N-1</b> et en <b>N</b>.</p>
    <ul>
      <li>L'année suit le calendrier. Les jours posés puisent d'abord dans N-1.</li>
      <li>Le reste de N au 31 décembre devient le N-1 de l'année suivante ; le reste de N-1 non pris est perdu (un rappel s'affiche s'il en reste).</li>
      <li>Les droits sont calculés tout seuls ; tape une valeur dans la case « Droits » pour corriger, vide-la pour revenir au calcul.</li>
    </ul>` , tab: 'pointage', ptTab: 'conges' },

  { id: 'types-absence', mod: 'pointage', g: 'pointage', title: 'Types d\'absence', html: () => `
    <p>En bas du sous-onglet Congés : renomme un type, change sa couleur, masque-le ou ajoutes-en un.</p>
    <ul>
      <li><b>Compteur</b> : le type a des droits annuels (à indiquer en jours).</li>
      <li><b>Jours calendaires</b> : poser une période marque aussi les week-ends et fériés, qui sont décomptés (ex. congé paternité).</li>
    </ul>`, tab: 'pointage', ptTab: 'conges' },

  { id: 'bilan', mod: 'pointage', g: 'pointage', title: 'Bilan des heures', html: () => `
    <p>Sous-onglet <b>Bilan</b>, par année :</p>
    <ul>
      <li><b>Cumul</b>, <b>moyenne</b> et <b>médiane</b> par semaine, <b>écart</b> à l'objectif.</li>
      <li>La moyenne et la médiane ne prennent que les <b>semaines complètes</b> : sans congé, absence ni férié, et terminées. Les autres apparaissent pâles dans le graphique.</li>
      <li><b>Heures par semaine</b> : clique une barre pour ouvrir la semaine. Le trait est l'objectif de la semaine (diminué des absences et fériés).</li>
      <li><b>Par mois</b> : heures, jours pointés, moyenne par jour, objectif et écart.</li>
      <li><b>Réglages</b> : objectif d'heures pour chaque jour de la semaine, jours fériés français automatiques.</li>
    </ul>
    ${see(['pointage-import'])}`, tab: 'pointage', ptTab: 'bilan' },

  { id: 'donnees', g: 'data', title: 'Où sont mes données', html: () => `
    <p>Tes données restent <b>dans ce navigateur, sur cet appareil</b>. Elles sont enregistrées à chaque modification. L'heure du dernier enregistrement s'affiche en bas de la barre latérale.</p>
    <p>Si l'historique du navigateur est effacé, elles partent avec. D'où l'intérêt d'au moins une de ces protections :</p>
    <ul>
      <li><b>Sauvegarde automatique</b> dans un dossier du PC (Edge ou Chrome).</li>
      <li><b>Synchro</b> avec un dépôt GitHub privé, qui sert aussi à retrouver tes données sur le téléphone.</li>
      <li><b>Export JSON</b> à la main, de temps en temps.</li>
    </ul>
    ${see(['sauvegarde-auto', 'synchro', 'export'])}`, tab: 'donnees' },

  { id: 'sauvegarde-auto', g: 'data', title: 'Sauvegarde automatique', html: () => `
    <p>Onglet Données. Choisis un dossier du PC (par exemple ton dossier ToDoList) : l'appli y écrit <code>todo-donnees.json</code> (toujours la dernière version) et une copie par jour dans <code>sauvegardes/</code>.</p>
    <ul>
      <li>Fonctionne avec Edge et Chrome. Ailleurs, utilise l'export JSON.</li>
      <li>Au redémarrage du navigateur, il peut demander de cliquer sur <b>Reprendre</b>. Choisis « Autoriser à chaque visite » pour ne plus avoir à le faire.</li>
      <li>« Recharger depuis le dossier » remet les données du fichier.</li>
    </ul>`, tab: 'donnees' },

  { id: 'synchro', g: 'data', title: 'Synchro PC ↔ téléphone', html: () => `
    <p>Onglet Données. Les données sont rangées dans un fichier d'un dépôt GitHub <b>privé</b>, à toi seul. Chaque appareil se connecte avec le même dépôt et un jeton d'accès.</p>
    <ul>
      <li>Crée un jeton GitHub « fine-grained » limité au seul dépôt des données (droit Contents en lecture et écriture), avec une date d'expiration.</li>
      <li>La synchro se fait seule quelques secondes après chaque modification, à l'ouverture de l'appli et quand tu y reviens. L'état s'affiche en bas de la barre latérale (☁).</li>
      <li>L'appli marche hors connexion et se resynchronise ensuite. Elle refuse de synchroniser vers un dépôt public.</li>
      <li>Si une version reçue ne te convient pas, un bouton permet de revenir à l'état de l'appareil d'avant la synchro.</li>
    </ul>`, tab: 'donnees' },

  { id: 'export', g: 'data', title: 'Export et import JSON', html: () => `
    <ul>
      <li><b>Exporter en JSON</b> télécharge un fichier avec toutes tes données (tâches, sujets, charge, pointage). La date du dernier export est rappelée.</li>
      <li><b>Importer un JSON</b> remplace les données actuelles par celles du fichier, après confirmation.</li>
      <li>Avant chaque import, une copie de l'état actuel est gardée : « Revenir à l'état d'avant le dernier import » la remet.</li>
    </ul>`, tab: 'donnees' },

  { id: 'excel', g: 'data', title: 'Import depuis Excel', html: () => `
    <p>Reprend ton fichier ToDoList.xlsm (feuilles « To do list » et « Archive ») :</p>
    <ul>
      <li>Chaque ligne <b>P</b>, <b>I</b> ou <b>A</b> devient un sujet : P → ${P(1)}, I → ${P(2)}, A → ${P(3)}.</li>
      <li>Les lignes <b>S</b> en dessous deviennent ses tâches : deadline, temps estimé (en heures), état, avancement, commentaires.</li>
      <li>Les colonnes Projet (renommée Code dans l'appli), Secteur et Produit fini deviennent les paramètres du sujet, utilisables dans les filtres.</li>
      <li>La feuille Archive arrive directement dans les archives.</li>
    </ul>
    <p>Un aperçu s'affiche avant d'importer. <b>Remplacer</b> repart de l'Excel seul, <b>Ajouter</b> garde aussi ce qui existe (attention aux doublons si l'Excel a déjà été importé).</p>`, tab: 'donnees' },

  { id: 'pointage-import', mod: 'pointage', g: 'data', title: 'Import de l\'historique de pointage', html: () => `
    <p>En bas du Bilan du Pointage : reprend ton Excel de pointage (une feuille par année). Les colonnes Date, Arrivé, Midi, Midi, Départ et CP sont repérées par leur en-tête, ainsi que les absences écrites en texte (Arrêt, Maladie, Naissance, Congé pat, Sans solde…) et les droits « CP N » / « CP N-1 ».</p>
    <p>Les jours déjà saisis dans l'appli sont gardés : l'import ne fait que compléter.</p>`, tab: 'pointage', ptTab: 'bilan' },

  { id: 'demo', g: 'data', title: 'Mode démo', html: () => `
    <p>« Voir l'exemple » ouvre l'appli remplie de données fictives (sujets, tâches, charge, pointage), pratique pour la montrer à un collègue.</p>
    <ul>
      <li>Tes vraies données ne sont pas touchées et rien n'est synchronisé ni sauvegardé pendant la démo.</li>
      <li>Le bandeau orange en haut permet de remettre l'exemple à zéro ou de quitter la démo.</li>
    </ul>` },

  { id: 'raccourcis', g: 'tips', title: 'Raccourcis et astuces', html: () => `
    <ul>
      <li><kbd>N</kbd> : nouvelle tâche (saisie rapide), depuis n'importe quelle page.</li>
      <li><kbd>?</kbd> : ouvrir ce mode d'emploi.</li>
      <li><kbd>Entrée</kbd> valide un champ, <kbd>Échap</kbd> annule la modification en cours ou ferme un panneau.</li>
      <li>Après une action (fait, archivé, reporté…), <b>Annuler</b> apparaît quelques secondes en bas de l'écran.</li>
      <li>Thème <b>Auto / Clair / Sombre</b> en bas de la barre latérale (sur ordinateur).</li>
      <li>Les petits <span style="display:inline-flex;vertical-align:middle;color:var(--accent);width:16px">${I_INFO}</span> à côté des titres et des cases ouvrent directement l'explication correspondante.</li>
    </ul>` }
];
const byId = id => SECTIONS.find(s => s.id === id) || SECTIONS[0];

// Résumé des fonctions globales (en tête du guide)
const FEATS = [
  ['dashboard', 'dash', 'Tableau de bord', 'Retards, tâches du jour et de demain, d\'un coup d\'œil.'],
  ['saisie', 'inbox', 'Saisie rapide', 'Noter une tâche en 3 secondes, la ranger plus tard.'],
  ['sujets', 'list', 'Sujets et priorités', 'Tes dossiers P1, P2, P3 et leur avancement calculé.'],
  ['charge', 'chart', 'Charge', 'Prévision de ton temps de travail jour par jour.'],
  ['chrono', 'clock', 'Chrono', 'Temps réel passé sur chaque tâche.'],
  ['pointer', 'clock', 'Pointage et congés', 'Heures du jour, absences, compteurs N-1 / N.'],
  ['archives', 'archive', 'Archives', 'Rien n\'est supprimé, tout se restaure.'],
  ['donnees', 'data', 'Données', 'Sauvegarde, synchro téléphone, import Excel, modules actifs.']
];

/* ---------- Panneau ---------- */
let opener = null;
const root = document.createElement('div');
root.id = 'guide';
document.body.appendChild(root);

function sectionHtml(s) {
  const tabBtn = s.tab
    ? `<a class="btn" href="#${s.tab}" data-gd-go${s.ptTab ? ` data-act="pt-tab" data-t="${s.ptTab}"` : ''}>Ouvrir l'onglet ${esc(tabName(s.tab))} →</a>` : '';
  return `<section class="gd-sec" id="gd-${s.id}" data-gd-sec="${s.id}" aria-labelledby="gd-h-${s.id}">
    <h3 id="gd-h-${s.id}">${esc(s.title)}<span class="gd-kicker">${esc(GROUPS.find(g => g[0] === s.g)[1])}</span></h3>
    ${s.html()}
    <div class="gd-actions">${tabBtn}<button type="button" class="gd-top" data-gd-to="top">↑ Sommaire</button></div>
  </section>`;
}
function tabName(k) {
  const n = (A.NAV || []).find(x => x[0] === k);
  return n ? n[1] : k;
}
function build() {
  root.innerHTML = `<div class="gd-bg" data-gd-close></div>
  <aside class="gd" role="dialog" aria-modal="true" aria-labelledby="gd-title">
    <div class="gd-head">
      <h2 id="gd-title">${I_BOOK}Mode d'emploi</h2>
      <button type="button" class="icon" data-gd-close title="Fermer (Échap)" aria-label="Fermer le mode d'emploi">${I_X}</button>
      <input type="search" class="gd-search" id="gd-search" placeholder="Chercher dans le mode d'emploi…" aria-label="Chercher dans le mode d'emploi" autocomplete="off">
    </div>
    <div class="gd-body" id="gd-body" tabindex="-1">
      <div id="gd-top">
        <div class="gd-intro">
          <p><b>Ma To-Do</b> remplace ton fichier Excel : des <b>sujets</b> classés par priorité, qui contiennent des <b>tâches</b> avec deadline et temps estimé. Le but : ne rien oublier et voir tout de suite ce qui est en retard ou prévu aujourd'hui.</p>
          <p>Tout s'enregistre seul. Rien n'est supprimé : on archive. Les petits <span style="display:inline-flex;vertical-align:middle;color:var(--accent);width:16px">${I_INFO}</span> dans l'appli ouvrent l'explication de la case ou du bouton à côté.</p>
        </div>
        <div class="gd-feats">${FEATS.filter(f => live().some(s => s.id === f[0])).map(([id, icon, t, d]) => `<button type="button" class="gd-feat" data-gd-to="${id}"><b>${ic(icon)}${esc(t)}</b><span>${esc(d)}</span></button>`).join('')}</div>
        <nav class="gd-toc" aria-label="Sommaire">${GROUPS.filter(([g]) => live().some(s => s.g === g)).map(([g, label]) => `<h3>${esc(label)}</h3>
          <div class="gd-toc-list">${live().filter(s => s.g === g).map(s => `<button type="button" data-gd-to="${s.id}" data-gd-toc="${s.id}">${esc(s.title)}</button>`).join('')}</div>`).join('')}
        </nav>
      </div>
      ${live().map(sectionHtml).join('')}
      <div class="gd-empty" id="gd-none" hidden>Rien trouvé. Essaie un autre mot.</div>
    </div>
  </aside>`;
}

function isOpen() { return !!root.firstChild; }
function open(id) {
  if (!isOpen()) {
    opener = document.activeElement;
    build();
    document.body.style.overflow = 'hidden';
  }
  const body = document.getElementById('gd-body');
  if (!id || id === 'top' || id === 'apercu') { body.scrollTop = 0; body.focus({ preventScroll: true }); return; }
  goTo(id);
}
function goTo(id) {
  const sec = document.getElementById('gd-' + id);
  if (!sec) return;
  const search = document.getElementById('gd-search');
  if (search.value) { search.value = ''; filter(''); }
  const body = document.getElementById('gd-body');
  body.scrollTop += sec.getBoundingClientRect().top - body.getBoundingClientRect().top - 12;
  sec.classList.remove('flash'); void sec.offsetWidth; sec.classList.add('flash');
  const h = sec.querySelector('h3');
  h.tabIndex = -1; h.focus({ preventScroll: true });
}
function close() {
  if (!isOpen()) return;
  root.innerHTML = '';
  document.body.style.overflow = '';
  if (opener && document.contains(opener)) opener.focus();
  opener = null;
}
function filter(q) {
  const words = q.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter(Boolean);
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  let n = 0;
  document.querySelectorAll('#guide [data-gd-sec]').forEach(sec => {
    const ok = !words.length || words.every(w => norm(sec.textContent).includes(w));
    sec.hidden = !ok; if (ok) n++;
  });
  document.getElementById('gd-top').hidden = !!words.length;
  document.getElementById('gd-none').hidden = n > 0;
}

/* ---------- Bouton d'aide (barre latérale) ---------- */
const side = document.querySelector('.side');
if (side && !side.querySelector('.gd-open')) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'gd-open';
  b.dataset.help = 'apercu';
  b.title = "Mode d'emploi (touche ?)";
  b.setAttribute('aria-label', "Ouvrir le mode d'emploi");
  b.innerHTML = `${I_HELP}<span class="lbl">Mode d'emploi</span><kbd>?</kbd>`;
  const nav = side.querySelector('.nav');
  nav ? nav.after(b) : side.appendChild(b);
}

/* ---------- Petits « i » contextuels ---------- */
// Repérés par un sélecteur, éventuellement le début du texte ; « in » : ajouté à la fin de l'élément, « after » : juste après
const SPOTS = [
  ['#main h1', 'Tableau de bord', 'dashboard'],
  ['#main h1', 'Sujets', 'sujets'],
  ['#main h1', 'Boîte de réception', 'inbox'],
  ['#main h1', 'Archives', 'archives'],
  ['#main h1', 'Données', 'donnees'],
  ['#main h1', 'Charge de travail', 'charge'],
  ['#main h1', 'Pointage', 'pointer'],
  ['#main h1', 'Projets', 'projets'],
  ['#main .pj-sec h3', 'Jalons', 'projets'],
  ['#main #qa', '', 'saisie'],
  ['#main .org-filters', '', 'filtres'],
  ['#main .prio-title', '', 'priorites', 'first'],
  ['#main details.sec-today > summary', '', 'taches'],
  ['#main .pt-dash .pt-today-l > a', '', 'pointer', 'after'],
  ['#main .cc-legend', '', 'charge'],
  ['#main details.sec > summary', 'Non comptées', 'charge'],
  ['#main .card h3', 'Créneaux fixes', 'creneaux'],
  ['#main .card h3', 'Ma semaine type', 'creneaux'],
  ['#main .pt-week .pt-head > span:first-child', '', 'pointer'],
  ['#main .card h3', 'Poser une absence', 'conges'],
  ['#main .pt-counter h3', '', 'compteurs'],
  ['#main .card h3', 'Absences', 'conges'],
  ['#main details.sec > summary', "Types d'absence", 'types-absence'],
  ['#main .card h3', 'Heures par semaine', 'bilan'],
  ['#main .card h3', 'Par mois', 'bilan'],
  ['#main .card h3', 'Réglages', 'bilan'],
  ['#main .card h3', 'Modules actifs', 'modules'],
  ['#main .card h3', 'Mode démo', 'demo'],
  ['#main .card h3', 'Sauvegarde automatique', 'sauvegarde-auto'],
  ['#main .card h3', 'Sauvegarde manuelle', 'export'],
  ['#main .card h3', 'Restaurer', 'export'],
  ['#main .card h3', 'Synchro', 'synchro'],
  ['#main .card h3', 'Import depuis Excel', 'excel'],
  ['#main .card h3', "Import de l'historique", 'pointage-import'],
  ['#main .card h3', 'Importer un historique', 'pointage-import'],
  ['#drawer .drawer h2', '', 'details'],
  ['#drawer .f > label', 'Temps estimé', 'durees'],
  ['#drawer .f > label', 'Répartition du travail', 'repartition'],
  ['#drawer .f > label', 'Temps passé', 'chrono'],
  ['#drawer .f > label', 'Répéter', 'recurrence']
];
const iBtn = id => `<button type="button" class="gd-i" data-help="${id}" title="Aide : ${esc(byId(id).title)}" aria-label="Aide : ${esc(byId(id).title)}">${I_INFO}</button>`;
function addInfo() {
  for (const [sel, text, id, where] of SPOTS) {
    let els = [...document.querySelectorAll(sel)];
    if (where === 'first') els = els.slice(0, 1);
    els.forEach(el => {
      if (text && !el.textContent.trim().startsWith(text)) return;
      if (where === 'after') {
        if (!(el.nextElementSibling && el.nextElementSibling.classList.contains('gd-i'))) el.insertAdjacentHTML('afterend', iBtn(id));
        return;
      }
      if (el.querySelector(':scope > .gd-i')) return;
      // Dans un titre qui contient un bouton de fermeture (panneau détails), le « i » se place avant ce bouton
      const x = el.querySelector(':scope > .x');
      x ? x.insertAdjacentHTML('beforebegin', iBtn(id)) : el.insertAdjacentHTML('beforeend', iBtn(id));
    });
  }
}
// Les cartes des modules (synchro, sauvegarde, imports) et le panneau détails se dessinent après le rendu : on surveille
let queued = false;
const queue = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; addInfo(); }); } };
window.addEventListener('todo:rendered', queue);
['main', 'drawer'].forEach(id => { const el = document.getElementById(id); if (el) new MutationObserver(queue).observe(el, { childList: true, subtree: true }); });
queue();

/* ---------- Événements ---------- */
document.addEventListener('click', e => {
  const h = e.target.closest('[data-help]');
  if (h) {
    // Ne pas déplier une section ni déclencher l'action de l'élément parent
    e.preventDefault(); e.stopPropagation();
    open(h.dataset.help);
    return;
  }
  if (!isOpen() || !root.contains(e.target)) return;
  const to = e.target.closest('[data-gd-to]');
  if (to) { to.dataset.gdTo === 'top' ? open('top') : goTo(to.dataset.gdTo); return; }
  if (e.target.closest('[data-gd-close]')) { close(); return; }
  // Lien vers un onglet : on ferme le guide, la navigation (et le sous-onglet du Pointage) se fait normalement
  if (e.target.closest('[data-gd-go]')) setTimeout(close, 0);
}, true);

document.addEventListener('input', e => { if (e.target.id === 'gd-search') filter(e.target.value); });

document.addEventListener('keydown', e => {
  if (isOpen()) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (e.target.id === 'gd-search' && e.target.value) { e.target.value = ''; filter(''); } else close(); return; }
    // Garde le focus dans le panneau
    if (e.key === 'Tab') {
      const f = [...root.querySelectorAll('button,a[href],input')].filter(x => !x.closest('[hidden]') && x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    // Les raccourcis de l'appli (N…) ne s'appliquent pas tant que le guide est ouvert
    if (!/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.key.length === 1) e.stopPropagation();
    return;
  }
  const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  if (e.key === '?' && !inField && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); open('top'); }
}, true);

A.guide = { open, close };
})();
