/* Décision de la Synchro : qui gagne entre cet appareil et GitHub (CONTEXT.md « Dernière synchro », « Conflit de synchro »).
   Fonctions pures, sans GitHub, sans localStorage ni page, et sans lire l'heure : utilisées par sync.js et testées sous Node.
   Le module ne pose aucune question : il dit laquelle poser. */
(function (root) {
'use strict';

// Partie partagée des données : l'affichage (ui) reste propre à chaque appareil, la date d'export n'est pas une donnée
function partagees(d) {
  const r = Object.assign({}, d);
  delete r.ui;
  delete r.exportedAt;
  return r;
}
const empreinte = d => JSON.stringify(partagees(d));
const vide = d => !(d.subjects || []).length && !(d.tasks || []).length && !Object.keys((d.pointage && d.pointage.days) || {}).length;
const formeValide = d => !!d && typeof d === 'object' && Array.isArray(d.subjects) && Array.isArray(d.tasks);
// « À envoyer » : cet appareil a changé depuis la Dernière synchro (derniere : null ou { version, empreinte }).
// Un appareil vide n'envoie jamais rien : il n'est donc jamais « à envoyer ».
const aEnvoyer = (local, derniere) => !vide(local) && (!derniere || empreinte(local) !== derniere.empreinte);

// Entrée : { local (données de cet appareil), distant (null ou { version, donnees }), derniere (null ou { version, empreinte }) }
// Sortie : { action: 'rien' | 'illisible' (fichier GitHub qui n'est pas une sauvegarde : rien ne change ici) | 'envoyer' (depuis : version de GitHub, null pour créer le fichier) | 'recevoir'
//   | 'adopter' (identiques : on note seulement la Dernière synchro)
//   | 'demander' (question : 'vide' | 'premier' | 'conflit' ; ok : garder cet appareil et l'envoyer ; annuler : recevoir GitHub) }
function decider({ local, distant, derniere }) {
  if (!distant) return vide(local) ? { action: 'rien' } : { action: 'envoyer', depuis: null };
  if (!formeValide(distant.donnees)) return { action: 'illisible' };
  const ici = empreinte(local);
  const modifie = !derniere || ici !== derniere.empreinte;
  if (derniere && distant.version === derniere.version)
    return aEnvoyer(local, derniere) ? { action: 'envoyer', depuis: distant.version } : { action: 'rien' };
  if (ici === empreinte(distant.donnees)) return { action: 'adopter' };
  if (vide(local)) return { action: 'recevoir' };
  const demander = question => ({ action: 'demander', question, ok: { action: 'envoyer', depuis: distant.version }, annuler: { action: 'recevoir' } });
  // GitHub vidé alors que cet appareil a des données : on ne vide jamais sans demander
  if (vide(distant.donnees)) return demander('vide');
  if (!derniere) return demander('premier');
  if (!modifie) return { action: 'recevoir' };
  return demander('conflit');
}

const api = { decider, aEnvoyer, partagees, empreinte, vide, formeValide };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.todoSyncDecision = api;
})(typeof window !== 'undefined' ? window : this);
