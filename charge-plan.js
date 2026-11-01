/* Calcul de la prévision de la Charge (module Charge) : répétition des créneaux fixes, créneaux du jour (fériés et absences
   en créneaux virtuels), jour où l'on peut placer du travail, placement d'une tâche et prévision sur N jours.
   Fonctions pures, sans accès aux données, aux filtres ni à la page : utilisées par chrono-charge.js et testées sous Node.
   Le calendrier est celui de metier.js (M.calendrier), absences du Pointage comprises ; le temps restant est sa règle unique. */
(function (root) {
'use strict';

const M = typeof module !== 'undefined' && module.exports ? require('./metier.js') : root.todoMetier;
const { addDays, parseYmd, lundi, remaining } = M;
const ecart = (a, b) => Math.round((parseYmd(a) - parseYmd(b)) / 86400000);
const somme = sls => sls.reduce((a, sl) => a + sl.durMin, 0);

// Un créneau fixe a-t-il lieu ce jour-là ? (entre son début et sa fin, jamais archivé ; « chaque jour travaillé » suit le calendrier)
function creneauLe(sl, ds, cal) {
  if (sl.archived || !sl.durMin) return false;
  if (sl.start && ds < sl.start) return false;
  if (sl.end && ds > sl.end) return false;
  const d = parseYmd(ds), wd = d.getDay();
  const st = sl.start ? parseYmd(sl.start) : null;
  switch (sl.freq) {
    case 'once': return ds === sl.start;
    case 'daily': return cal.travaille(ds);
    case 'weekly': return (sl.days || []).includes(wd);
    case 'biweekly':
      if (!(sl.days || []).includes(wd)) return false;
      return Math.round(ecart(lundi(ds), lundi(sl.start || ds)) / 7) % 2 === 0;
    case 'monthday': return !!st && d.getDate() === st.getDate();
    case 'monthweek': return !!st && wd === st.getDay() && Math.ceil(d.getDate() / 7) === Math.ceil(st.getDate() / 7);
  }
  return false;
}

// Outils de la prévision pour des créneaux et un calendrier donnés
function outils(creneaux, cal, libelleAbsence) {
  const enSemaine = ds => cal.horaireDu(ds) > 0;
  // Fériés et absences d'un jour de la semaine type, en créneaux virtuels : ils prennent ce que le calendrier retire
  // de l'horaire du jour (heures prévues)
  function joursPris(ds) {
    if (!enSemaine(ds)) return [];
    const virtuel = (id, title, durMin) => [{ id: id + ds, title, durMin, freq: 'once', start: ds, days: [], virtual: true }];
    const f = cal.ferie(ds), pris = cal.horaireDu(ds) - cal.heuresPrevues(ds);
    if (f) return virtuel('cal-fer-', 'Férié : ' + f, pris);
    return cal.absence(ds) ? virtuel('cal-abs-', (libelleAbsence && libelleAbsence(ds)) || 'Absence', pris) : [];
  }
  // Créneaux fixes du jour, plus les fériés et les absences.
  // Un jour entièrement pris (congé, férié) ne reçoit pas les créneaux fixes : la réunion n'a pas lieu sans toi
  function creneauxDu(ds) {
    const off = joursPris(ds);
    if (off.length && somme(off) >= cal.horaireDu(ds)) return off;
    return creneaux.filter(sl => creneauLe(sl, ds, cal)).concat(off);
  }
  // Jour où l'on peut placer du travail : jour travaillé du calendrier qu'il reste du temps une fois les créneaux du jour retirés
  const peutTravailler = ds => cal.travaille(ds) && somme(creneauxDu(ds)) < cal.horaireDu(ds);
  return { enSemaine, creneauxDu, peutTravailler };
}

// Placement d'une tâche à partir du jour td → { rem, parts: [{ date, min }], overdue, late, unplanned }
function placer(t, td, peutTravailler) {
  const rem = remaining(t);
  const res = { rem, parts: [], overdue: false, late: false, unplanned: false };
  if (!rem) return res;
  const mode = (t.plan && t.plan.mode) || 'deadline';
  const dl = t.deadline;
  const from = t.startDate && t.startDate > td ? t.startDate : td;
  if (mode === 'daily' && t.plan.dailyMin > 0) {
    let left = rem, d = from;
    for (let i = 0; left > 0 && i < 400; i++, d = addDays(d, 1)) {
      if (!peutTravailler(d)) continue;
      const m = Math.min(left, t.plan.dailyMin);
      res.parts.push({ date: d, min: m }); left -= m;
    }
    res.late = !!dl && res.parts.length > 0 && res.parts[res.parts.length - 1].date > dl;
    res.overdue = !!dl && dl < td;
    return res;
  }
  if (!dl) { res.unplanned = true; return res; }
  if (dl < td) { res.overdue = true; res.parts.push({ date: premierJour(td, peutTravailler), min: rem }); return res; }
  if (mode === 'spread') {
    const days = [];
    for (let d = from; d <= dl; d = addDays(d, 1)) if (peutTravailler(d)) days.push(d);
    if (days.length) {
      const base = Math.floor(rem / days.length);
      let extra = rem - base * days.length;
      days.forEach(d => { const m = base + (extra-- > 0 ? 1 : 0); if (m > 0) res.parts.push({ date: d, min: m }); });
      return res;
    }
  }
  res.parts.push({ date: dernierJour(dl, td, peutTravailler), min: rem });
  return res;
}
function dernierJour(ds, plancher, peutTravailler) {
  let d = ds;
  for (let i = 0; i < 14 && d > plancher && !peutTravailler(d); i++) d = addDays(d, -1);
  return d;
}
function premierJour(ds, peutTravailler) {
  let d = ds;
  for (let i = 0; i < 14 && !peutTravailler(d); i++) d = addDays(d, 1);
  return peutTravailler(d) ? d : ds;
}

// Prévision sur n jours à partir de jour.
// taches : [{ t, pr }], tâches déjà choisies par la page (visibles, ouvertes, filtres) avec la priorité de leur sujet ;
// creneaux : les créneaux fixes ; cal : M.calendrier(…) ; libelleAbsence(ds) : nom d'une absence (sinon « Absence »).
// → { days: [{ date, cap, work, fixed, fixedMin, items: [{ t, min, pr, al }], byPrio, taskMin, load, free }],
//     unplanned: [t] (sans échéance), noEst: [t] (sans durée estimée), after (minutes au-delà des n jours) }
function prevision({ taches, creneaux, cal, jour, n, libelleAbsence }) {
  const o = outils(creneaux || [], cal, libelleAbsence);
  const days = [], idx = {};
  for (let i = 0; i < n; i++) {
    const ds = addDays(jour, i);
    const fx = o.creneauxDu(ds);
    const day = { date: ds, cap: cal.horaireDu(ds), work: o.enSemaine(ds), fixed: fx, fixedMin: somme(fx), items: [], byPrio: { 1: 0, 2: 0, 3: 0, 0: 0 }, taskMin: 0 };
    days.push(day); idx[ds] = day;
  }
  const unplanned = [], noEst = [];
  let after = 0;
  for (const { t, pr } of taches) {
    if (!t.estimateMin) { noEst.push(t); continue; }
    const al = placer(t, jour, o.peutTravailler);
    if (al.unplanned) { unplanned.push(t); continue; }
    for (const p of al.parts) {
      const day = idx[p.date];
      if (!day) { after += p.min; continue; }
      day.items.push({ t, min: p.min, pr, al });
      day.byPrio[pr] += p.min; day.taskMin += p.min;
    }
  }
  for (const d of days) {
    d.load = d.fixedMin + d.taskMin;
    d.free = d.cap - d.load;
    d.items.sort((a, b) => (a.pr || 4) - (b.pr || 4) || b.min - a.min);
  }
  return { days, unplanned, noEst, after };
}

const api = { prevision, creneauLe };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.chargePlan = api;
})(typeof window !== 'undefined' ? window : this);
