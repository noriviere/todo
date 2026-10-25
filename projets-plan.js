/* Calcul du planning des projets (module Projets) : jours ouvrés, étapes en cascade, alertes de jalons, boucles.
   Fonctions pures, sans accès aux données ni à la page : utilisées par projets.js et testées sous Node. */
(function (root) {
'use strict';

const toT = ymd => Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10));
const toYmd = t => new Date(t).toISOString().slice(0, 10);
const DAY = 864e5;
const isWork = (t, wd) => wd.includes(new Date(t).getUTCDay());
const okDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const workDaysOf = wd => Array.isArray(wd) && wd.length ? wd : [1, 2, 3, 4, 5];

// Le jour ouvré lui-même, ou le suivant
function nextWorkday(ymd, workDays) {
  const wd = workDaysOf(workDays);
  let t = toT(ymd);
  for (let i = 0; i < 14 && !isWork(t, wd); i++) t += DAY;
  return toYmd(t);
}
// n jours ouvrés après ymd (n = 0 : ymd tel quel)
function addWorkdays(ymd, n, workDays) {
  const wd = workDaysOf(workDays);
  let t = toT(ymd);
  for (let k = 0; k < n; k++) { t += DAY; for (let i = 0; i < 14 && !isWork(t, wd); i++) t += DAY; }
  return toYmd(t);
}

const durOf = s => Math.max(1, Math.round(+(s.plan && s.plan.durDays) || 1));
const lagOf = s => Math.max(0, Math.round(+s.lagDays || 0));
const prevOf = (s, ids) => (Array.isArray(s.after) ? s.after : []).filter(id => id !== s.id && ids.has(id));

// Ordre topologique (Kahn) ; les étapes prises dans une boucle sont rendues à part
function topo(steps) {
  const ids = new Set(steps.map(s => s.id));
  const indeg = new Map(steps.map(s => [s.id, prevOf(s, ids).length]));
  const next = new Map(steps.map(s => [s.id, []]));
  steps.forEach(s => prevOf(s, ids).forEach(p => next.get(p).push(s.id)));
  const queue = steps.filter(s => !indeg.get(s.id)).map(s => s.id), order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    next.get(id).forEach(n => { indeg.set(n, indeg.get(n) - 1); if (!indeg.get(n)) queue.push(n); });
  }
  const done = new Set(order);
  return { order, looped: steps.map(s => s.id).filter(id => !done.has(id)) };
}

function schedule(steps, milestones, workDays) {
  const wd = workDaysOf(workDays);
  const byStep = new Map(steps.map(s => [s.id, s]));
  const ids = new Set(byStep.keys());
  const { order, looped } = topo(steps);
  const byId = {}, unplanned = [...looped];
  for (const id of order) {
    const s = byStep.get(id);
    const ends = prevOf(s, ids).map(p => byId[p] && byId[p].end).filter(Boolean).sort();
    let start;
    if (ends.length) start = addWorkdays(ends[ends.length - 1], 1 + lagOf(s), wd);
    else if (s.plan && okDate(s.plan.start)) start = nextWorkday(s.plan.start, wd);
    else { unplanned.push(id); continue; }
    byId[id] = { start, end: addWorkdays(start, durOf(s) - 1, wd) };
  }
  const alerts = [];
  (milestones || []).filter(m => m && !m.archived && okDate(m.date)).forEach(m =>
    (Array.isArray(m.before) ? m.before : []).forEach(sid => {
      if (byId[sid] && byId[sid].end > m.date) alerts.push({ milestoneId: m.id, subjectId: sid });
    }));
  return { byId, unplanned, alerts, order: order.filter(id => byId[id]) };
}

// Vrai si « toId commence après fromId » créerait une boucle (toId est déjà en amont de fromId)
function wouldCycle(steps, fromId, toId) {
  if (fromId === toId) return true;
  const byStep = new Map(steps.map(s => [s.id, s]));
  const seen = new Set(), stack = [fromId];
  while (stack.length) {
    const id = stack.pop();
    if (id === toId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    const s = byStep.get(id);
    if (s && Array.isArray(s.after)) stack.push(...s.after);
  }
  return false;
}

// Lignes génériques du Gantt : jalons (par date) puis étapes planifiées dans l'ordre du calcul.
// kind 'tache' est réservé au dépliage futur d'une étape (V1 : jamais produit).
function buildRows(steps, sched, milestones) {
  const ms = (milestones || []).filter(m => m && !m.archived && okDate(m.date)).sort((a, b) => a.date.localeCompare(b.date));
  return [
    ...ms.map(m => ({ kind: 'jalon', id: m.id, parentId: null, start: m.date, end: m.date, depth: 0 })),
    ...sched.order.map(id => ({ kind: 'etape', id, parentId: null, start: sched.byId[id].start, end: sched.byId[id].end, depth: 0 }))
  ];
}

const api = { nextWorkday, addWorkdays, schedule, wouldCycle, buildRows };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.projetsPlan = api;
})(typeof window !== 'undefined' ? window : this);
