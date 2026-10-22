/* Pointage (heures d'arrivée, repas, départ), absences et compteurs de congés.
   Module séparé de index.html : il s'appuie sur window.todoApp et sur les points d'accroche (hooks).
   Les absences et les jours fériés bloquent la capacité dans la vue Charge (hook dayOff). */
(function () {
'use strict';
const A = window.todoApp;
if (!A || !A.hooks) { console.warn('pointage.js : index.html ne fournit pas les points d\'accroche attendus.'); return; }
const { esc, fmtDur, today, addDays, diffDays, parseYmd, longDate, uid, ymd, toast } = A;
const db = () => A.getData();

A.ICON.clock = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';

// Types d'absence proposés au départ ; « counted » = a un compteur de jours (droits N-1 / N)
const DEFAULT_TYPES = [
  { id: 'cp', label: 'Congés payés', short: 'CP', color: '#23915f', counted: true },
  { id: 'rtt', label: 'RTT', short: 'RTT', color: '#4f63e8', counted: true },
  { id: 'maladie', label: 'Maladie', short: 'Mal.', color: '#d43a4a', counted: false },
  { id: 'naissance', label: 'Congé naissance', short: 'Nais.', color: '#c2559b', counted: false },
  { id: 'paternite', label: 'Congé paternité', short: 'Pat.', color: '#8e5bd8', counted: false },
  { id: 'sanssolde', label: 'Sans solde', short: 'SS', color: '#7b8396', counted: false },
  { id: 'recup', label: 'Récupération', short: 'Récup', color: '#0f8fa0', counted: false },
  { id: 'famille', label: 'Événement familial', short: 'Fam.', color: '#c77d0e', counted: false }
];
const PART = { full: 'Journée', am: 'Matin', pm: 'Après-midi' };
const FIELDS = [['in', 'Arrivée'], ['lunchOut', 'Début repas'], ['lunchIn', 'Fin repas'], ['out', 'Départ']];
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/* ---------- Données (stockées dans les mêmes données que les tâches, donc sauvegardées et synchronisées) ---------- */
function P() {
  const d = db();
  if (!d.pointage || typeof d.pointage !== 'object') d.pointage = {};
  const p = d.pointage;
  if (!p.days || typeof p.days !== 'object') p.days = {};
  if (!Array.isArray(p.types)) p.types = DEFAULT_TYPES.map(t => Object.assign({}, t));
  if (!p.rights || typeof p.rights !== 'object') p.rights = {};      // { typeId: { année: { acq, n1 } } }
  if (!p.defaults || typeof p.defaults !== 'object') p.defaults = { cp: 25 };  // droits annuels par défaut
  if (p.holidays === undefined) p.holidays = true;
  if (!p.dayMin || typeof p.dayMin !== 'object') p.dayMin = { 1: 465, 2: 465, 3: 465, 4: 465, 5: 240, 6: 0, 0: 0 };  // 7h45 du lundi au jeudi, 4h le vendredi                   // jours fériés français automatiques
  return p;
}
const day = ds => P().days[ds] || null;
function dayW(ds) { const p = P(); return p.days[ds] || (p.days[ds] = {}); }
function cleanDay(ds) {
  const p = P(), d = p.days[ds];
  if (d && !d.in && !d.lunchOut && !d.lunchIn && !d.out && !d.abs && !d.note) delete p.days[ds];
}
const type = id => P().types.find(t => t.id === id) || { id, label: id, short: id, color: '#9aa1b2', counted: false };
const workDays = () => Array.isArray(db().settings.workDays) ? db().settings.workDays : [1, 2, 3, 4, 5];
const workdayMin = () => db().settings.workdayMin || 420;
// Objectif de temps par jour de la semaine (index = getDay()), en minutes
const WD_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WD_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const dayTarget = wd => { const m = P().dayMin && P().dayMin[wd]; return m != null ? m : workDays().includes(wd) ? workdayMin() : 0; };
const weekTarget = () => WD_ORDER.reduce((a, wd) => a + dayTarget(wd), 0);

/* ---------- Jours fériés (France métropolitaine) ---------- */
const holCache = {};
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), dd = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(new Date(y, month - 1, dd));
}
function holidays(y) {
  if (holCache[y]) return holCache[y];
  const e = easter(y), r = {};
  [['01-01', "Jour de l'an"], ['05-01', 'Fête du travail'], ['05-08', 'Victoire 1945'], ['07-14', 'Fête nationale'],
   ['08-15', 'Assomption'], ['11-01', 'Toussaint'], ['11-11', 'Armistice'], ['12-25', 'Noël']].forEach(([md, n]) => { r[y + '-' + md] = n; });
  r[addDays(e, 1)] = 'Lundi de Pâques';
  r[addDays(e, 39)] = 'Ascension';
  r[addDays(e, 50)] = 'Lundi de Pentecôte';
  return (holCache[y] = r);
}
const holiday = ds => P().holidays ? holidays(+ds.slice(0, 4))[ds] || null : null;
const isWork = ds => workDays().includes(parseYmd(ds).getDay()) && !holiday(ds);

/* ---------- Calculs d'heures ---------- */
const toMin = s => { if (!s) return null; const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const nowHm = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
// Temps travaillé d'un jour. Pour aujourd'hui, une journée pas encore terminée compte jusqu'à maintenant (live).
function worked(ds) {
  const d = day(ds);
  if (!d || !d.in) return { min: 0, live: false };
  const i = toMin(d.in);
  let end = toMin(d.out), live = false;
  if (end == null) {
    if (ds !== today()) return { min: 0, live: false, open: true };
    end = d.lunchOut && !d.lunchIn ? toMin(d.lunchOut) : nowMin();
    live = !(d.lunchOut && !d.lunchIn);
  }
  let min = end - i;
  if (d.lunchOut && d.lunchIn) min -= Math.max(0, toMin(d.lunchIn) - toMin(d.lunchOut));
  return { min: Math.max(0, min), live, open: !d.out };
}
const absFrac = d => d && d.abs ? (d.abs.part === 'am' || d.abs.part === 'pm' ? 0.5 : 1) : 0;
// Temps attendu d'un jour (objectif), diminué des absences et nul les jours fériés ou non travaillés
const expected = ds => holiday(ds) ? 0 : Math.round(dayTarget(parseYmd(ds).getDay()) * (1 - absFrac(day(ds))));
function mondayOf(ds) { const wd = parseYmd(ds).getDay(); return addDays(ds, -((wd + 6) % 7)); }
function isoWeek(ds) {
  const d = parseYmd(ds); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
}
const median = arr => { if (!arr.length) return 0; const s = arr.slice().sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
const fmtH = min => (min < 0 ? '-' : '') + (fmtDur(Math.abs(min)) || '0h');
const fmtJ = n => (Math.round(n * 10) / 10).toLocaleString('fr-FR') + ' j';
const shortDate = ds => parseYmd(ds).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');

/* ---------- Compteurs de congés : N-1 consommé en premier, le reste de N devient le N-1 de l'année suivante ---------- */
function absDays(typeId) {
  return Object.keys(P().days).filter(ds => P().days[ds].abs && P().days[ds].abs.type === typeId).sort();
}
function rightsOf(typeId, y) { return (P().rights[typeId] || {})[y] || {}; }
function counter(typeId, y) {
  const all = absDays(typeId);
  const years = all.map(ds => +ds.slice(0, 4)).concat(Object.keys(P().rights[typeId] || {}).map(Number), [+today().slice(0, 4)]);
  const first = Math.min(...years);
  let n1Start = 0, res = null;
  for (let yy = first; yy <= y; yy++) {
    const r = rightsOf(typeId, yy);
    const acq = r.acq != null ? +r.acq : (+P().defaults[typeId] || 0);
    const auto = yy === first ? 0 : n1Start;
    const start = r.n1 != null ? +r.n1 : auto;
    const c = { year: yy, n1: { start, auto, set: r.n1 != null, taken: 0, planned: 0 }, n: { start: acq, set: r.acq != null, taken: 0, planned: 0 } };
    let leftN1 = start;
    for (const ds of all) {
      if (+ds.slice(0, 4) !== yy) continue;
      let f = absFrac(day(ds));
      const k = ds <= today() ? 'taken' : 'planned';
      const fromN1 = Math.min(f, Math.max(0, leftN1));
      leftN1 -= fromN1; c.n1[k] += fromN1; f -= fromN1;
      c.n[k] += f;
    }
    c.n1.left = c.n1.start - c.n1.taken - c.n1.planned;
    c.n.left = c.n.start - c.n.taken - c.n.planned;
    n1Start = c.n.left;
    res = c;
  }
  return res;
}

/* ---------- Charge de travail : absences et fériés retirent la capacité du jour ---------- */
if (A.hooks.dayOff) A.hooks.dayOff.push(ds => {
  const out = [];
  const h = holiday(ds);
  if (h && workDays().includes(parseYmd(ds).getDay())) out.push({ id: 'pt-hol-' + ds, title: 'Férié : ' + h, durMin: workdayMin(), freq: 'once', start: ds, days: [], virtual: true });
  const d = day(ds);
  if (d && d.abs && !h) {
    const t = type(d.abs.type);
    out.push({ id: 'pt-abs-' + ds, title: t.label + (d.abs.part !== 'full' ? ' (' + PART[d.abs.part].toLowerCase() + ')' : ''), durMin: Math.round(workdayMin() * absFrac(d)), freq: 'once', start: ds, days: [], virtual: true });
  }
  return out;
});

/* ---------- Pointer maintenant ---------- */
function nextField(d) {
  if (!d || !d.in) return 'in';
  if (!d.out && !d.lunchOut) return 'lunchOut|out';
  if (d.lunchOut && !d.lunchIn) return 'lunchIn';
  if (!d.out) return 'out';
  return null;
}
const PUNCH_DONE = { in: 'Arrivée', lunchOut: 'Début de pause', lunchIn: 'Fin de pause', out: 'Départ' };
const PUNCH_LBL = { in: "Pointer l'arrivée", lunchOut: 'Pause déjeuner', lunchIn: 'Retour de pause', out: 'Pointer le départ' };
function punchButtons(ds, small) {
  const d = day(ds);
  if (d && d.abs && d.abs.part === 'full') return '';
  const nf = nextField(d);
  if (!nf) return '';
  return nf.split('|').map((f, i) => `<button class="btn${i === 0 ? ' primary' : ''}${small ? ' pt-sm' : ''}" data-act="pt-punch" data-f="${f}" data-d="${ds}">${PUNCH_LBL[f]}</button>`).join('');
}
function todayLine() {
  const ds = today(), d = day(ds), w = worked(ds);
  const h = holiday(ds);
  if (d && d.abs && d.abs.part === 'full') return `<b>${esc(type(d.abs.type).label)}</b> aujourd'hui`;
  const parts = [];
  if (d && d.in) parts.push('arrivé à ' + d.in.replace(':', 'h'));
  if (d && d.lunchOut) parts.push('repas ' + d.lunchOut.replace(':', 'h') + (d.lunchIn ? '–' + d.lunchIn.replace(':', 'h') : ' (en pause)'));
  if (d && d.out) parts.push('parti à ' + d.out.replace(':', 'h'));
  if (!parts.length) return h ? `Jour férié (${esc(h)})` : isWork(ds) ? "Pas encore pointé aujourd'hui" : 'Jour non travaillé';
  return parts.join(' · ') + ` · <b${w.live ? ' data-pt-live' : ''}>${fmtH(w.min)}</b>${w.live ? ' <span class="pt-live">en cours</span>' : ''}`;
}

/* ---------- Vue ---------- */
const ui = () => db().ui;
let weekStart = null, year = null;

function weekRows(mon) {
  let tot = 0, exp = 0;
  const rows = [];
  for (let i = 0; i < 7; i++) {
    const ds = addDays(mon, i), d = day(ds) || {}, w = worked(ds), h = holiday(ds);
    const off = !workDays().includes(parseYmd(ds).getDay());
    const full = d.abs && d.abs.part === 'full';
    tot += w.min; exp += expected(ds);
    const tcol = d.abs ? type(d.abs.type).color : '';
    rows.push(`<div class="pt-row${ds === today() ? ' td' : ''}${off ? ' off' : ''}${h ? ' hol' : ''}${full ? ' absd' : ''}" data-d="${ds}"${tcol ? ` style="--tc:${tcol}"` : ''}>
      <span class="pt-date"><b>${parseYmd(ds).toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '')}</b> ${parseYmd(ds).getDate()} ${MONTHS[parseYmd(ds).getMonth()]}${h ? `<span class="pt-hol" title="Jour férié">${esc(h)}</span>` : ''}</span>
      <span class="pt-abs">
        <select data-pt="abs" title="Présent ou type d'absence">
          <option value="">${off || h ? '—' : 'Présent'}</option>
          ${P().types.filter(t => !t.archived || (d.abs && d.abs.type === t.id)).map(t => `<option value="${t.id}" ${d.abs && d.abs.type === t.id ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}
        </select>
        ${d.abs ? `<select data-pt="part" title="Journée ou demi-journée">${Object.entries(PART).map(([k, l]) => `<option value="${k}" ${d.abs.part === k ? 'selected' : ''}>${l}</option>`).join('')}</select>` : ''}
      </span>
      <span class="pt-times">${full ? '' : FIELDS.map(([f, l]) => `<label><small>${l}</small><input type="time" data-pt="${f}" value="${d[f] || ''}" title="${l}"></label>`).join('')}</span>
      <span class="pt-tot${w.live ? ' live' : ''}"${w.live ? ' data-pt-live' : ''}>${w.min ? fmtH(w.min) : ''}</span>
      <input class="inline pt-note" data-pt="note" value="${esc(d.note || '')}" placeholder="note">
    </div>`);
  }
  return { html: rows.join(''), tot, exp };
}

function viewWeek() {
  const mon = weekStart || mondayOf(today());
  const { html, tot, exp } = weekRows(mon);
  const ecart = tot - exp;
  const end = addDays(mon, 6);
  return `<div class="card pt-today">
      <div class="pt-today-l"><div class="hint">${longDate(today()).replace(/^./, c => c.toUpperCase())}</div><div>${todayLine()}</div></div>
      <div class="pt-today-r">${punchButtons(today())}</div>
    </div>
    <div class="toolbar pt-weeknav">
      <button class="btn" data-act="pt-week" data-n="-7" title="Semaine précédente">‹</button>
      <b>Semaine ${isoWeek(mon)}</b><span class="hint">du ${parseYmd(mon).getDate()} ${MONTHS[parseYmd(mon).getMonth()]} au ${parseYmd(end).getDate()} ${MONTHS[parseYmd(end).getMonth()]} ${end.slice(0, 4)}</span>
      <button class="btn" data-act="pt-week" data-n="7" title="Semaine suivante">›</button>
      ${mon !== mondayOf(today()) ? '<button class="chip" data-act="pt-week" data-n="0">Cette semaine</button>' : ''}
    </div>
    <div class="card pt-week">
      <div class="pt-row pt-head"><span>Jour</span><span>Présence</span><span class="pt-times"><i>Arrivée</i><i>Début repas</i><i>Fin repas</i><i>Départ</i></span><span class="pt-tot">Total</span><span></span></div>
      ${html}
      <div class="pt-weeksum"><span>Total semaine <b>${fmtH(tot)}</b></span><span>objectif ${fmtH(exp)}</span><span class="${ecart < 0 ? 'cc-red' : 'cc-green'}">${ecart >= 0 ? '+' : ''}${fmtH(ecart)}</span></div>
    </div>`;
}

function rangesOf(y) {
  // Regroupe les absences consécutives du même type (en sautant week-ends et fériés)
  const days = Object.keys(P().days).filter(ds => ds.startsWith(y + '-') && P().days[ds].abs).sort();
  const out = [];
  for (const ds of days) {
    const a = P().days[ds].abs, last = out[out.length - 1];
    let gapOk = false;
    if (last && last.type === a.type && last.part === a.part) {
      gapOk = true;
      for (let x = addDays(last.to, 1); x < ds; x = addDays(x, 1)) if (isWork(x) && !(day(x) && day(x).abs)) { gapOk = false; break; }
    }
    if (gapOk) { last.to = ds; last.days.push(ds); last.n += absFrac(P().days[ds]); }
    else out.push({ type: a.type, part: a.part, from: ds, to: ds, days: [ds], n: absFrac(P().days[ds]) });
  }
  return out;
}

function viewLeave() {
  const y = year || +today().slice(0, 4);
  const counted = P().types.filter(t => t.counted && !t.archived);
  const ranges = rangesOf(y);
  const byType = {};
  ranges.forEach(r => { byType[r.type] = (byType[r.type] || 0) + r.n; });
  const cell = (c, k) => `<td>${fmtJ(c[k])}</td>`;
  const cards = counted.map(t => {
    const c = counter(t.id, y);
    return `<div class="card pt-counter" style="--tc:${t.color}">
      <h3><i class="pt-dot"></i>${esc(t.label)} ${y}</h3>
      <table class="pt-ctab">
        <tr><th></th><th>Droits</th><th>Pris</th><th>Posés à venir</th><th>Reste</th></tr>
        <tr><th>N-1 <span class="hint">(report ${y - 1})</span></th>
          <td><input class="inline pt-num" data-pt-right="n1" data-type="${t.id}" value="${c.n1.set ? c.n1.start : ''}" placeholder="${(Math.round(c.n1.auto * 10) / 10).toLocaleString('fr-FR')}" title="Vide = calculé depuis le reste de ${y - 1}. Saisis une valeur pour corriger."></td>
          ${cell(c.n1, 'taken')}${cell(c.n1, 'planned')}<td class="${c.n1.left < 0 ? 'cc-red' : ''}"><b>${fmtJ(c.n1.left)}</b></td></tr>
        <tr><th>N <span class="hint">(droits ${y})</span></th>
          <td><input class="inline pt-num" data-pt-right="acq" data-type="${t.id}" value="${c.n.set ? c.n.start : ''}" placeholder="${(+P().defaults[t.id] || 0).toLocaleString('fr-FR')}" title="Vide = droits annuels par défaut (réglages plus bas)"></td>
          ${cell(c.n, 'taken')}${cell(c.n, 'planned')}<td class="${c.n.left < 0 ? 'cc-red' : ''}"><b>${fmtJ(c.n.left)}</b></td></tr>
      </table>
      ${c.n1.left > 0 && y === +today().slice(0, 4) ? `<p class="hint" style="margin:8px 0 0">Il reste ${fmtJ(c.n1.left)} de N-1 à poser avant le 31 décembre.</p>` : ''}
    </div>`;
  }).join('');
  const t0 = addDays(today(), 1);
  return `<div class="toolbar pt-weeknav">
      <button class="btn" data-act="pt-year" data-n="-1">‹</button><b>${y}</b><button class="btn" data-act="pt-year" data-n="1">›</button>
      ${y !== +today().slice(0, 4) ? '<button class="chip" data-act="pt-year" data-n="0">Cette année</button>' : ''}
    </div>
    <div class="card"><h3>Poser une absence</h3>
      <p>Les jours travaillés de la période sont marqués (week-ends et fériés sautés). Une absence posée à l'avance bloque la capacité de ces jours dans la vue Charge.</p>
      <div class="pt-form">
        <label>Du <input type="date" class="date" id="pt-from" value="${t0}"></label>
        <label>au <input type="date" class="date" id="pt-to" value="${t0}"></label>
        <select id="pt-type">${P().types.filter(t => !t.archived).map(t => `<option value="${t.id}">${esc(t.label)}</option>`).join('')}</select>
        <select id="pt-part">${Object.entries(PART).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
        <button class="btn primary" data-act="pt-post">Poser</button>
      </div>
    </div>
    ${cards}
    <div class="card"><h3>Absences ${y}</h3>
      ${Object.keys(byType).length ? `<div class="pt-tags">${Object.entries(byType).map(([k, n]) => `<span class="pt-tag" style="--tc:${type(k).color}"><i class="pt-dot"></i>${esc(type(k).label)} <b>${fmtJ(n)}</b></span>`).join('')}</div>` : ''}
      <div class="list">${ranges.length ? ranges.slice().reverse().map(r => `<div class="task pt-range" style="--pc:${type(r.type).color}" data-from="${r.from}" data-to="${r.to}" data-type="${r.type}">
        <span class="title">${esc(type(r.type).label)}${r.part !== 'full' ? ' · ' + PART[r.part].toLowerCase() : ''}</span>
        <span class="hint">${r.from === r.to ? 'le ' + shortDate(r.from) : 'du ' + shortDate(r.from) + ' au ' + shortDate(r.to)}${r.from > today() ? ' · <b class="pt-future">à venir</b>' : ''}</span>
        <b class="cc-min">${fmtJ(r.n)}</b>
        <button class="icon" data-act="pt-unpost" title="Retirer cette absence">✕</button>
      </div>`).join('') : '<div class="empty">Aucune absence cette année.</div>'}</div>
    </div>
    <details class="sec"><summary><span class="chev">${A.ICON.chev}</span>Types d'absence et droits annuels</summary>
      <div class="card">
        <p>« Compteur » : le type a des droits en jours, suivis en N-1 et N. Le reste de N à la fin de l'année devient le N-1 de l'année suivante, et les jours posés puisent d'abord dans N-1.</p>
        <div class="pt-types">${P().types.map(t => `<div class="pt-type${t.archived ? ' arch' : ''}" data-tyid="${t.id}">
          <input type="color" data-pt-type="color" value="${t.color}" title="Couleur">
          <input class="inline" data-pt-type="label" value="${esc(t.label)}">
          <label class="tog"><input type="checkbox" data-pt-type="counted" ${t.counted ? 'checked' : ''}> compteur</label>
          ${t.counted ? `<label class="tog">droits/an <input class="inline pt-num" data-pt-type="def" value="${P().defaults[t.id] != null ? P().defaults[t.id] : ''}" placeholder="0"> j</label>` : '<span></span>'}
          <button class="icon" data-act="pt-type-arch" title="${t.archived ? 'Réactiver' : 'Masquer ce type'}">${t.archived ? A.ICON.restore : A.ICON.archive}</button>
        </div>`).join('')}</div>
        <button class="btn" data-act="pt-type-add" style="margin-top:10px">+ Ajouter un type</button>
      </div>
    </details>`;
}

function stats(y) {
  const weeks = {}, months = Array.from({ length: 12 }, () => ({ min: 0, days: 0, exp: 0 }));
  let tot = 0, daysIn = 0, exp = 0;
  const end = `${y}-12-31` < today() ? `${y}-12-31` : today();
  // On compte à partir du premier jour saisi, pour ne pas creuser l'écart avant le début du suivi
  const first = Object.keys(P().days).sort()[0];
  const start = !first ? addDays(end, 1) : first > `${y}-01-01` ? first : `${y}-01-01`;
  for (let ds = start; ds <= end; ds = addDays(ds, 1)) {
    const w = worked(ds), e = expected(ds), mi = parseYmd(ds).getMonth();
    const wk = mondayOf(ds);
    if (!weeks[wk]) weeks[wk] = { min: 0, exp: 0, days: 0 };
    weeks[wk].min += w.min; weeks[wk].exp += e;
    months[mi].min += w.min; months[mi].exp += e;
    if (w.min) { weeks[wk].days++; months[mi].days++; daysIn++; }
    tot += w.min; exp += e;
  }
  const list = Object.keys(weeks).sort().map(k => Object.assign({ mon: k }, weeks[k]));
  const vals = list.filter(w => w.min > 0).map(w => w.min);
  const dayVals = [];
  for (let ds = start; ds <= end; ds = addDays(ds, 1)) { const m = worked(ds).min; if (m) dayVals.push(m); }
  return { tot, exp, daysIn, list, months, vals, dayVals };
}

function viewStats() {
  const y = year || +today().slice(0, 4);
  const s = stats(y);
  const max = Math.max(weekTarget(), ...s.list.map(w => w.min)) * 1.08 || 1;
  const pct = v => (v / max * 100).toFixed(2) + '%';
  const chart = s.list.length ? `<div class="pt-chart">${s.list.map(w => {
    const over = w.min > w.exp && w.exp > 0;
    return `<button class="pt-col${w.min ? '' : ' empty'}" data-act="pt-goweek" data-d="${w.mon}" title="Semaine ${isoWeek(w.mon)} : ${fmtH(w.min)} (objectif ${fmtH(w.exp)})">
      <span class="pt-bar"><span class="pt-tgt" style="bottom:${pct(w.exp)}"></span><i class="${over ? 'over' : ''}" style="height:${pct(w.min)}"></i></span>
      <span class="pt-wl">${isoWeek(w.mon)}</span></button>`;
  }).join('')}</div>` : '<div class="empty">Rien de pointé cette année.</div>';
  const ecart = s.tot - s.exp;
  return `<div class="toolbar pt-weeknav">
      <button class="btn" data-act="pt-year" data-n="-1">‹</button><b>${y}</b><button class="btn" data-act="pt-year" data-n="1">›</button>
      ${y !== +today().slice(0, 4) ? '<button class="chip" data-act="pt-year" data-n="0">Cette année</button>' : ''}
    </div>
    <div class="stats">
      <div class="stat today"><div class="v">${fmtH(s.tot)}</div><div class="l">cumul ${y} · ${s.daysIn} jour${s.daysIn > 1 ? 's' : ''} pointé${s.daysIn > 1 ? 's' : ''}</div></div>
      <div class="stat"><div class="v">${fmtH(avg(s.vals))}</div><div class="l">moyenne par semaine (${s.vals.length} sem.)</div></div>
      <div class="stat"><div class="v">${fmtH(median(s.vals))}</div><div class="l">médiane par semaine</div></div>
      <div class="stat ${ecart < 0 ? 'late' : ''}"><div class="v">${ecart >= 0 ? '+' : ''}${fmtH(ecart)}</div><div class="l">écart à l'objectif (${fmtH(s.exp)} attendues)</div></div>
    </div>
    <div class="card"><h3>Heures par semaine</h3>
      <p class="hint">Trait : objectif de la semaine (diminué des absences et fériés). Clique une semaine pour l'ouvrir.</p>
      ${chart}
    </div>
    <div class="card"><h3>Par mois</h3>
      <table class="pt-mtab"><tr><th>Mois</th><th>Heures</th><th>Jours</th><th>Moy./jour</th><th>Objectif</th><th>Écart</th></tr>
      ${s.months.map((m, i) => m.min || m.exp ? `<tr><td>${MONTHS[i]}</td><td><b>${fmtH(m.min)}</b></td><td>${m.days}</td><td>${m.days ? fmtH(Math.round(m.min / m.days)) : ''}</td><td>${fmtH(m.exp)}</td><td class="${m.min - m.exp < 0 ? 'cc-red' : 'cc-green'}">${m.min - m.exp >= 0 ? '+' : ''}${fmtH(m.min - m.exp)}</td></tr>` : '').join('')}
      <tr class="pt-total"><td>Total</td><td><b>${fmtH(s.tot)}</b></td><td>${s.daysIn}</td><td>${fmtH(avg(s.dayVals))}</td><td>${fmtH(s.exp)}</td><td>${ecart >= 0 ? '+' : ''}${fmtH(ecart)}</td></tr></table>
      <p class="hint" style="margin:8px 0 0">Par jour pointé : moyenne ${fmtH(avg(s.dayVals))}, médiane ${fmtH(median(s.dayVals))}.</p>
    </div>
    <div class="card"><h3>Réglages</h3>
      <div class="cc-settings">
        <span>Objectif par jour ${WD_ORDER.map(wd => `<label class="pt-dmin">${WD_SHORT[wd]} <input class="inline est" data-pt-set="day" data-wd="${wd}" value="${esc(fmtDur(dayTarget(wd)) || '0')}" title="Ex. 7h45, 4h, 0"></label>`).join('')} <span class="hint">soit ${fmtH(weekTarget())} par semaine</span></span>
        <label class="tog"><input type="checkbox" data-pt-set="hol" ${P().holidays ? 'checked' : ''}> Jours fériés français automatiques</label>
      </div>
    </div>`;
}

const TABS = [['semaine', 'Semaine'], ['conges', 'Congés'], ['bilan', 'Bilan']];
A.views.pointage = () => {
  const tab = ui().ptTab || 'semaine';
  return `<h1>Pointage</h1>
    <p class="sub">Heures d'arrivée, de repas et de départ, absences et compteurs de congés.</p>
    <div class="toolbar"><div class="chips">${TABS.map(([k, l]) => `<button class="chip ${k === tab ? 'on' : ''}" data-act="pt-tab" data-t="${k}">${l}</button>`).join('')}</div></div>
    ${tab === 'conges' ? viewLeave() : tab === 'bilan' ? viewStats() : viewWeek()}`;
};
if (!A.NAV.some(x => x[0] === 'pointage')) {
  const i = A.NAV.findIndex(x => x[0] === 'charge');
  A.NAV.splice(i < 0 ? A.NAV.length - 1 : i + 1, 0, ['pointage', 'Pointage', 'clock']);
}
// Bandeau sur le tableau de bord : où j'en suis aujourd'hui, et le bouton pour pointer
A.hooks.dashTop.push(() => {
  const ds = today();
  if (!isWork(ds) && !day(ds)) return '';
  return `<div class="card pt-today pt-dash"><div class="pt-today-l"><a href="#pointage" class="hint">Pointage</a><div>${todayLine()}</div></div><div class="pt-today-r">${punchButtons(ds, true)}</div></div>`;
});

/* ---------- Événements ---------- */
function setAbs(ds, typeId, part) {
  const d = dayW(ds);
  if (typeId) d.abs = { type: typeId, part: part || (d.abs && d.abs.part) || 'full' };
  else delete d.abs;
  cleanDay(ds);
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b || !b.dataset.act.startsWith('pt-')) return;
  const act = b.dataset.act;
  switch (act) {
    case 'pt-tab': ui().ptTab = b.dataset.t; A.save(); A.render(); break;
    case 'pt-week': { const n = +b.dataset.n; weekStart = n ? addDays(weekStart || mondayOf(today()), n) : null; A.render(); break; }
    case 'pt-goweek': weekStart = b.dataset.d; ui().ptTab = 'semaine'; A.save(); A.render(); break;
    case 'pt-year': { const n = +b.dataset.n; year = n ? (year || +today().slice(0, 4)) + n : null; A.render(); break; }
    case 'pt-punch': {
      const ds = b.dataset.d, f = b.dataset.f, d = dayW(ds);
      d[f] = nowHm();
      A.save(); A.render();
      toast(`${PUNCH_DONE[f]} pointé${f === 'in' ? 'e' : ''} à ${d[f].replace(':', 'h')}`, () => { delete d[f]; cleanDay(ds); A.save(); A.render(); });
      break;
    }
    case 'pt-post': {
      const from = document.getElementById('pt-from').value, to = document.getElementById('pt-to').value || from;
      const typeId = document.getElementById('pt-type').value, part = document.getElementById('pt-part').value;
      if (!from || to < from) { toast('Choisis une période valide'); return; }
      if (diffDays(to, from) > 370) { toast('Période trop longue (plus d\'un an)'); return; }
      const before = {}, set = [];
      for (let ds = from; ds <= to; ds = addDays(ds, 1)) {
        if (!isWork(ds)) continue;
        before[ds] = day(ds) && day(ds).abs ? Object.assign({}, day(ds).abs) : null;
        setAbs(ds, typeId, part); set.push(ds);
      }
      if (!set.length) { toast('Aucun jour travaillé dans cette période'); return; }
      A.save(); A.render();
      const n = set.length * (part === 'full' ? 1 : 0.5);
      toast(`${fmtJ(n)} de ${type(typeId).label} posé${n > 1 ? 's' : ''}`, () => { set.forEach(ds => setAbs(ds, before[ds] && before[ds].type, before[ds] && before[ds].part)); A.save(); A.render(); });
      break;
    }
    case 'pt-unpost': {
      const r = b.closest('.pt-range'), from = r.dataset.from, to = r.dataset.to, tp = r.dataset.type;
      const done = [];
      for (let ds = from; ds <= to; ds = addDays(ds, 1)) { const d = day(ds); if (d && d.abs && d.abs.type === tp) { done.push([ds, Object.assign({}, d.abs)]); setAbs(ds, null); } }
      A.save(); A.render();
      toast('Absence retirée', () => { done.forEach(([ds, a]) => setAbs(ds, a.type, a.part)); A.save(); A.render(); });
      break;
    }
    case 'pt-type-add': {
      const id = 'ty' + uid().slice(-6);
      P().types.push({ id, label: 'Nouveau type', short: '', color: '#9aa1b2', counted: false });
      A.save(); A.render();
      setTimeout(() => { const el = document.querySelector(`[data-tyid="${id}"] [data-pt-type="label"]`); if (el) { el.focus(); el.select(); } }, 0);
      break;
    }
    case 'pt-type-arch': { const t = P().types.find(x => x.id === b.closest('[data-tyid]').dataset.tyid); if (!t) return; t.archived = !t.archived; A.save(); A.render(); break; }
  }
});
document.addEventListener('change', e => {
  const el = e.target;
  const row = el.closest('.pt-row[data-d]');
  if (row && el.dataset.pt) {
    const ds = row.dataset.d, f = el.dataset.pt;
    if (f === 'abs') setAbs(ds, el.value || null, 'full');
    else if (f === 'part') setAbs(ds, day(ds).abs.type, el.value);
    else { const d = dayW(ds); const v = f === 'note' ? el.value.trim() : el.value; if (v) d[f] = v; else delete d[f]; cleanDay(ds); }
    A.save(); f === 'note' ? A.scheduleRender() : A.render();
    return;
  }
  if (el.dataset.ptRight) {
    const tid = el.dataset.type, y = year || +today().slice(0, 4), v = el.value.trim().replace(',', '.');
    const r = P().rights[tid] || (P().rights[tid] = {}), ry = r[y] || (r[y] = {});
    if (v === '') delete ry[el.dataset.ptRight];
    else if (!Number.isNaN(+v)) ry[el.dataset.ptRight] = +v;
    else { toast('Indique un nombre de jours, ex. 25 ou 2,5'); }
    if (!Object.keys(ry).length) delete r[y];
    A.save(); A.render();
    return;
  }
  if (el.dataset.ptType) {
    const t = P().types.find(x => x.id === el.closest('[data-tyid]').dataset.tyid); if (!t) return;
    const f = el.dataset.ptType;
    if (f === 'label') t.label = el.value.trim() || t.label;
    else if (f === 'color') t.color = el.value;
    else if (f === 'counted') t.counted = el.checked;
    else if (f === 'def') { const v = el.value.trim().replace(',', '.'); if (v === '') delete P().defaults[t.id]; else if (!Number.isNaN(+v)) P().defaults[t.id] = +v; }
    A.save(); A.render();
    return;
  }
  if (el.dataset.ptSet === 'day') {
    const wd = +el.dataset.wd, v = el.value.trim();
    const m = v === '' || v === '0' ? 0 : A.parseDur(v);
    if (m == null || Number.isNaN(m)) { toast('Durée non comprise. Exemple : 7h45'); el.value = fmtDur(dayTarget(wd)) || '0'; return; }
    P().dayMin[wd] = m; A.save(); A.render();
  } else if (el.dataset.ptSet === 'hol') { P().holidays = el.checked; A.save(); A.render(); }
});
document.addEventListener('keydown', e => {
  const el = e.target;
  if (e.key === 'Enter' && (el.dataset.ptRight || el.dataset.ptType || el.dataset.ptSet || el.dataset.pt === 'note')) { e.preventDefault(); el.blur(); }
});

// Le total du jour en cours avance tout seul (sans re-rendu, pour ne pas gêner une saisie)
setInterval(() => {
  const w = worked(today());
  document.querySelectorAll('[data-pt-live]').forEach(el => { el.textContent = fmtH(w.min); });
}, 30000);

// Accès pour d'autres modules (import d'historique…)
A.pointage = { P, day, worked, holiday, isWork, counter, type };
A.render();
})();
