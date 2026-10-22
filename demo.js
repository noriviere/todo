/* Données d'exemple pour le mode démo (index.html?demo).
   Les dates sont calculées à partir d'aujourd'hui pour que le tableau de bord ait toujours
   des tâches en retard, du jour, de demain… Rien n'est écrit dans les vraies données :
   en mode démo, index.html range tout dans le stockage de l'onglet (sessionStorage). */
(function () {
'use strict';
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const add = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
const wd = s => parse(s).getDay();
const isWork = s => wd(s) >= 1 && wd(s) <= 5;
// n-ième jour travaillé après (n > 0) ou avant (n < 0) la date, 0 = la date elle-même
function work(s, n) {
  let d = s;
  if (n === 0) { while (!isWork(d)) d = add(d, 1); return d; }
  const st = n > 0 ? 1 : -1;
  for (let i = 0; i < Math.abs(n);) { d = add(d, st); if (isWork(d)) i++; }
  return d;
}
const hm = m => pad(Math.floor(m / 60)) + ':' + pad(m % 60);
// Pseudo-aléatoire stable : la démo affiche la même chose à chaque ouverture le même jour
const rnd = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return ((h >>> 0) % 1000) / 1000; };

function frHolidays(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
    mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
  const ea = ymd(new Date(y, mo - 1, da));
  return new Set([`${y}-01-01`, add(ea, 1), `${y}-05-01`, `${y}-05-08`, add(ea, 39), add(ea, 50), `${y}-07-14`, `${y}-08-15`, `${y}-11-01`, `${y}-11-11`, `${y}-12-25`]);
}

function data(td) {
  const now = new Date().toISOString();
  const at = (ds, h = 9) => new Date(parse(ds).getTime() + h * 3600000).toISOString();
  const S = (id, title, priority, projet, secteur, produit, description, extra) =>
    Object.assign({ id, title, priority, projet, secteur, produit, description, createdAt: at(add(td, -60)), updatedAt: now }, extra);
  const subjects = [
    S('s1', 'Lancement gamme Atlas', 1, 'Atlas', 'Industrie', 'Atlas 200', 'Mise sur le marché de la nouvelle gamme. Objectif lié au variable.'),
    S('s2', 'Réduction des coûts achats', 1, 'Achats 2026', 'Achats', '', 'Objectif : -5 % sur les familles principales.'),
    S('s3', 'Audit qualité fournisseur', 2, 'Qualité', 'Industrie', 'Atlas 200', ''),
    S('s4', 'Nouveau tableau de bord commercial', 2, 'Reporting', 'Commerce', '', 'Remplacer les extractions manuelles du lundi.'),
    S('s5', 'Administratif', 3, '', 'Interne', '', ''),
    S('s6', 'Veille et formation', 3, '', 'Interne', '', ''),
    S('s7', 'Salon professionnel de printemps', 2, 'Événements', 'Commerce', '', 'Terminé.', { archived: true, archivedAt: at(add(td, -20)) })
  ];

  let n = 0;
  const T = (subjectId, title, deadline, o = {}) => {
    const t = Object.assign({
      id: 't' + (++n), subjectId, title, deadline, estimateMin: 60, status: 'todo', progress: 0,
      createdAt: at(add(td, -30 + n)), updatedAt: now, order: n
    }, o);
    if (t.status === 'done') t.doneAt = t.doneAt || at(deadline || td, 16);
    if (t.timeLogs) t.realMin = t.timeLogs.reduce((a, l) => a + l.min, 0);
    return t;
  };
  const log = (ds, min, kind = 'manual') => ({ id: 'l' + ds + min, date: ds, min, kind });
  const tasks = [
    // En retard
    T('s1', 'Valider la fiche technique Atlas 200', work(td, -2), { estimateMin: 90, status: 'doing', progress: 60, timeLogs: [log(work(td, -3), 45, 'timer'), log(work(td, -2), 30)] }),
    T('s2', 'Relancer le fournisseur pour le devis emballages', work(td, -1), { estimateMin: 15 }),
    T('s5', 'Envoyer la note de frais de septembre', work(td, -4), { estimateMin: 20 }),
    // Aujourd'hui
    T('s1', 'Préparer la présentation du comité de lancement', td, { estimateMin: 120, status: 'doing', progress: 30, timeLogs: [log(work(td, -1), 50, 'timer')] }),
    T('s3', 'Lire le rapport d\'audit et lister les écarts', td, { estimateMin: 60 }),
    T('s4', 'Point avec l\'équipe data sur les sources', td, { estimateMin: 30, notes: 'Demander l\'accès à l\'entrepôt de données.' }),
    T('s6', 'Revue de presse du secteur', td, { estimateMin: 20, recur: { freq: 'week', interval: 1 } }),
    // Demain et cette semaine
    T('s2', 'Comparer les trois offres de transport', work(td, 1), { estimateMin: 90 }),
    T('s1', 'Briefer l\'équipe commerciale sur Atlas', work(td, 1), { estimateMin: 45 }),
    T('s3', 'Plan d\'actions correctives avec le fournisseur', work(td, 3), { estimateMin: 240, startDate: td, plan: { mode: 'spread', dailyMin: null } }),
    T('s4', 'Maquette des indicateurs clés', work(td, 4), { estimateMin: 180, status: 'waiting', notes: 'En attente des chiffres du contrôle de gestion.' }),
    T('s5', 'Poser les congés de fin d\'année', work(td, 2), { estimateMin: 10 }),
    // Plus tard
    T('s1', 'Bilan des premières ventes Atlas', work(td, 12), { estimateMin: 120 }),
    T('s2', 'Renégocier le contrat de maintenance', work(td, 15), { estimateMin: 300, startDate: work(td, 5), plan: { mode: 'daily', dailyMin: 60 } }),
    T('s4', 'Recette du tableau de bord', work(td, 20), { estimateMin: 240 }),
    T('s6', 'Formation tableur avancé (e-learning)', null, { estimateMin: 180 }),
    T('s5', 'Entretien annuel : préparer l\'auto-évaluation', work(td, 9), { estimateMin: 60 }),
    // Faites ou annulées
    T('s1', 'Choisir le nom commercial de la gamme', work(td, -8), { status: 'done', progress: 100, estimateMin: 60, timeLogs: [log(work(td, -8), 75)] }),
    T('s3', 'Planifier la visite de l\'usine', work(td, -5), { status: 'done', progress: 100, estimateMin: 30, timeLogs: [log(work(td, -5), 25)] }),
    T('s2', 'Analyse des dépenses par famille', work(td, -6), { status: 'done', progress: 100, estimateMin: 180, timeLogs: [log(work(td, -7), 120), log(work(td, -6), 90)] }),
    T('s4', 'Ancien export Excel automatisé', work(td, -3), { status: 'cancelled', estimateMin: 120 }),
    T('s7', 'Réserver le stand', add(td, -40), { status: 'done', progress: 100 }),
    // Boîte de réception (sans sujet)
    T(null, 'Rappeler le service informatique pour le nouveau PC', null, { estimateMin: 15 }),
    T(null, 'Idée : partager un modèle de compte rendu', null, { estimateMin: null }),
    T(null, 'Répondre au sondage interne', work(td, 2), { estimateMin: 10 })
  ];

  const fixedSlots = [
    { id: 'f1', title: 'Point hebdo équipe', durMin: 60, freq: 'weekly', days: [1], start: add(td, -60), end: null, archived: false },
    { id: 'f2', title: 'Comité projet', durMin: 90, freq: 'biweekly', days: [4], start: work(add(td, -14), 0), end: null, archived: false }
  ];

  // Pointage : huit semaines d'heures, une semaine de congés, un jour de maladie, des congés posés à venir
  const days = {};
  const y = +td.slice(0, 4);
  const hol = new Set([...frHolidays(y), ...frHolidays(y - 1)]);
  const monday = add(td, -((wd(td) + 6) % 7));
  const cpWeek = add(monday, -21);
  const sick = add(monday, -10);  // vendredi d'il y a deux semaines
  for (let d = add(monday, -56); d <= td; d = add(d, 1)) {
    if (!isWork(d) || hol.has(d)) continue;
    if (d >= cpWeek && d < add(cpWeek, 5)) { days[d] = { abs: { type: 'cp', part: 'full' } }; continue; }
    if (d === sick) { days[d] = { abs: { type: 'maladie', part: 'full' } }; continue; }
    const r = rnd(d), r2 = rnd(d + 'x');
    const inn = 8 * 60 + 5 + Math.round(r * 40);
    if (d === td) { days[d] = { in: hm(inn) }; continue; }
    if (wd(d) === 5) { days[d] = { in: hm(inn), out: hm(inn + 240 + Math.round((r2 - 0.5) * 30)) }; continue; }
    const lo = 12 * 60 + Math.round(r2 * 25), li = lo + 45 + Math.round(r * 20);
    const out = inn + 465 + (li - lo) + Math.round((r2 - 0.4) * 50);
    days[d] = { in: hm(inn), lunchOut: hm(lo), lunchIn: hm(li), out: hm(out) };
  }
  days[add(monday, -2 * 7 + 2)] = Object.assign(days[add(monday, -2 * 7 + 2)] || {}, { note: 'Déplacement chez le fournisseur' });
  const nextFri = add(monday, 11);
  days[nextFri] = { abs: { type: 'cp', part: 'full' } };
  days[add(monday, 14 + 2)] = { abs: { type: 'rtt', part: 'pm' } };

  return {
    version: 1,
    subjects,
    tasks,
    fixedSlots,
    settings: { theme: 'auto', workdayMin: 420, lastExport: null, workDays: [1, 2, 3, 4, 5] },
    ui: { expanded: ['s1', 's3'], showClosed: false, search: '', dims: { projet: '', secteur: '', produit: '' } },
    pointage: {
      days,
      rights: { cp: { [y]: { acq: 25, n1: 6 } }, rtt: { [y]: { acq: 10, n1: 0 } } },
      defaults: { cp: 25, rtt: 10 },
      dayMin: { 1: 465, 2: 465, 3: 465, 4: 465, 5: 240, 6: 0, 0: 0 },
      holidays: true
    }
  };
}

window.todoDemo = { data };
})();
