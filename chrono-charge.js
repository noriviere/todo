/* Chrono, temps réel et prévision de charge.
   Module séparé de index.html : il s'appuie sur window.todoApp et sur les points d'accroche (hooks). */
(function () {
'use strict';
const A = window.todoApp;
if (!A || !A.hooks) { console.warn('chrono-charge.js : index.html ne fournit pas les points d\'accroche attendus.'); return; }
const { esc, fmtDur, parseDur, today, addDays, diffDays, parseYmd, longDate, uid, nowIso, ymd, toast } = A;
const db = () => A.getData();
// Modules activables (Données › Modules actifs) : chrono et charge se masquent séparément
const on = id => !A.modOn || A.modOn(id);

const WD = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];          // index = getDay()
const WD_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WD_LONG = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const FREQ = {
  weekly: 'Chaque semaine',
  biweekly: 'Une semaine sur deux',
  daily: 'Chaque jour travaillé',
  monthday: 'Chaque mois (même date)',
  monthweek: 'Chaque mois (même jour de semaine)',
  once: 'Une seule fois'
};
const PLAY = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z"/></svg>';
const STOP = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>';
A.ICON.chart = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6" rx="1"/><rect x="12" y="7" width="3" height="11" rx="1"/><rect x="17" y="10" width="3" height="8" rx="1"/></svg>';

/* ---------- Réglages et créneaux fixes (stockés dans les mêmes données) ---------- */
function settings() {
  const s = db().settings;
  if (!s.workdayMin) s.workdayMin = 420;
  return s;
}
function slots() {
  const d = db();
  if (!Array.isArray(d.fixedSlots)) d.fixedSlots = [];
  return d.fixedSlots;
}
// Jour de la semaine type (calendrier commun) : un jour férié garde sa capacité, prise par un créneau « Férié »
const isWorkDay = ds => A.calendrier().semaine.includes(parseYmd(ds).getDay());
const capacity = ds => isWorkDay(ds) ? settings().workdayMin : 0;
// Fériés (calendrier commun) et absences (fournies par le Pointage) d'un jour de la semaine type, en créneaux virtuels
function joursPris(ds) {
  if (!isWorkDay(ds)) return [];
  const virtuel = (id, title, durMin) => [{ id: id + ds, title, durMin, freq: 'once', start: ds, days: [], virtual: true }];
  const f = A.calendrier().ferie(ds), cap = settings().workdayMin;
  if (f) return virtuel('cal-fer-', 'Férié : ' + f, cap);
  const a = A.absenceDu(ds);
  return a ? virtuel('cal-abs-', a.label || 'Absence', Math.round(cap * (a.part === 'full' ? 1 : 0.5))) : [];
}
function slotOn(sl, ds) {
  if (sl.archived || !sl.durMin) return false;
  if (sl.start && ds < sl.start) return false;
  if (sl.end && ds > sl.end) return false;
  const d = parseYmd(ds), wd = d.getDay();
  const st = sl.start ? parseYmd(sl.start) : null;
  switch (sl.freq) {
    case 'once': return ds === sl.start;
    case 'daily': return isWorkDay(ds);
    case 'weekly': return (sl.days || []).includes(wd);
    case 'biweekly':
      if (!(sl.days || []).includes(wd)) return false;
      return Math.round(diffDays(A.lundi(ds), A.lundi(sl.start || ds)) / 7) % 2 === 0;
    case 'monthday': return !!st && d.getDate() === st.getDate();
    case 'monthweek': return !!st && wd === st.getDay() && Math.ceil(d.getDate() / 7) === Math.ceil(st.getDate() / 7);
  }
  return false;
}
// Créneaux fixes du jour, plus les fériés et les absences
// Un jour entièrement pris (congé, férié) ne reçoit pas les créneaux fixes : la réunion n'a pas lieu sans toi
function slotsOn(ds) {
  const off = joursPris(ds);
  if (off.length && off.reduce((a, sl) => a + sl.durMin, 0) >= capacity(ds)) return off;
  return slots().filter(sl => slotOn(sl, ds)).concat(off);
}
const fixedMin = ds => slotsOn(ds).reduce((a, sl) => a + sl.durMin, 0);
// Jour où l'on peut placer du travail : jour travaillé pas entièrement pris par des créneaux fixes (congés…)
const canWork = ds => isWorkDay(ds) && fixedMin(ds) < capacity(ds);
function describeSlot(sl) {
  const days = (sl.days || []).slice().sort((a, b) => WD_ORDER.indexOf(a) - WD_ORDER.indexOf(b)).map(x => WD_LONG[x]).join(', ');
  const st = sl.start ? parseYmd(sl.start) : null;
  switch (sl.freq) {
    case 'once': return st ? 'le ' + longDate(sl.start) : 'date à choisir';
    case 'daily': return 'chaque jour travaillé';
    case 'weekly': return days ? 'chaque ' + days : 'aucun jour choisi';
    case 'biweekly': return days ? 'un ' + days + ' sur deux' : 'aucun jour choisi';
    case 'monthday': return st ? 'le ' + st.getDate() + ' de chaque mois' : '';
    case 'monthweek': {
      if (!st) return '';
      const n = Math.ceil(st.getDate() / 7);
      return `le ${n === 1 ? '1er' : n + 'e'} ${WD_LONG[st.getDay()]} du mois`;
    }
  }
  return '';
}

/* ---------- Chrono ---------- */
const running = () => db().tasks.filter(t => t.timerStart);
const elapsedSec = t => t.timerStart ? Math.max(0, Math.floor((Date.now() - Date.parse(t.timerStart)) / 1000)) : 0;
function clock(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60;
  const p = n => String(n).padStart(2, '0');
  return (h ? h + ':' + p(m) : m) + ':' + p(s);
}
function addLog(t, log) {
  if (!Array.isArray(t.timeLogs)) t.timeLogs = [];
  t.timeLogs.push(Object.assign({ id: uid() }, log));
  t.realMin = (t.realMin || 0) + log.min;
}
const nom = t => `« ${t.title || 'Sans titre'} »`;
const nomCreneau = sl => `« ${sl.title || 'Sans nom'} »`;
function startTimer(t) {
  // Un seul chrono à la fois : démarrer une tâche arrête la précédente (dans la même modification).
  // Si elle tourne depuis plus de 4 h (oubli ?), on demande le temps à garder ; annuler ne démarre rien.
  A.modifier(`Chrono démarré : ${nom(t)}`, () => {
    for (const r of running()) {
      if (r === t) continue;
      const long = Date.now() - Date.parse(r.timerStart) > 240 * 60000;
      stopTimer(r, !long);
      if (r.timerStart) return false;
    }
    t.timerStart = nowIso();
    if (t.status === 'todo' || t.status === 'waiting') A.setTaskField(t, 'status', 'doing');
  });
}
// Arrête le chrono et ajoute le temps passé. Annuler cet arrêt relance le chrono depuis son heure de départ.
function stopTimer(t, quiet) {
  if (!t.timerStart) return;
  let msg = null;
  A.modifier(`Chrono arrêté : ${nom(t)}`, () => {
    const start = t.timerStart, end = nowIso();
    let min = Math.round((Date.parse(end) - Date.parse(start)) / 60000);
    if (!quiet && min > 240) {
      // Chrono oublié ? On propose de corriger avant d'enregistrer
      const v = prompt(`Le chrono de ${nom(t)} tourne depuis ${fmtDur(min)}.\nTemps à garder (ex. 2h, 45min) :`, fmtDur(min));
      if (v === null) return false;
      const m = parseDur(v);
      if (m != null && !Number.isNaN(m)) min = m;
    }
    t.timerStart = null;
    if (min >= 1) addLog(t, { start, end, date: ymd(new Date(start)), min, kind: 'timer' });
    msg = min >= 1 ? `${fmtDur(min)} ajoutées au temps réel` : "Moins d'une minute : rien d'ajouté";
  });
  if (!quiet && msg) toast(msg);
}

/* ---------- Prévision de charge ---------- */
// Temps restant : règle unique de metier.js, la même que la carte sujet
const remaining = A.remaining;
function lastWorkDay(ds, floor) {
  let d = ds;
  for (let i = 0; i < 14 && d > floor && !canWork(d); i++) d = addDays(d, -1);
  return d;
}
function firstWorkDay(ds) {
  let d = ds;
  for (let i = 0; i < 14 && !canWork(d); i++) d = addDays(d, 1);
  return canWork(d) ? d : ds;
}
function allocate(t, td) {
  const rem = remaining(t);
  const res = { rem, parts: [], overdue: false, late: false, unplanned: false };
  if (!rem) return res;
  const mode = (t.plan && t.plan.mode) || 'deadline';
  const dl = t.deadline;
  const from = t.startDate && t.startDate > td ? t.startDate : td;
  if (mode === 'daily' && t.plan.dailyMin > 0) {
    let left = rem, d = from;
    for (let i = 0; left > 0 && i < 400; i++, d = addDays(d, 1)) {
      if (!canWork(d)) continue;
      const m = Math.min(left, t.plan.dailyMin);
      res.parts.push({ date: d, min: m }); left -= m;
    }
    res.late = !!dl && res.parts.length > 0 && res.parts[res.parts.length - 1].date > dl;
    res.overdue = !!dl && dl < td;
    return res;
  }
  if (!dl) { res.unplanned = true; return res; }
  if (dl < td) { res.overdue = true; res.parts.push({ date: firstWorkDay(td), min: rem }); return res; }
  if (mode === 'spread') {
    const days = [];
    for (let d = from; d <= dl; d = addDays(d, 1)) if (canWork(d)) days.push(d);
    if (days.length) {
      const base = Math.floor(rem / days.length);
      let extra = rem - base * days.length;
      days.forEach(d => { const m = base + (extra-- > 0 ? 1 : 0); if (m > 0) res.parts.push({ date: d, min: m }); });
      return res;
    }
  }
  res.parts.push({ date: lastWorkDay(dl, td), min: rem });
  return res;
}
function forecast(n) {
  const td = today();
  const days = [], idx = {};
  for (let i = 0; i < n; i++) {
    const ds = addDays(td, i);
    const fx = slotsOn(ds);
    const day = { date: ds, cap: capacity(ds), work: isWorkDay(ds), fixed: fx, fixedMin: fx.reduce((a, s) => a + s.durMin, 0), items: [], byPrio: { 1: 0, 2: 0, 3: 0, 0: 0 }, taskMin: 0 };
    days.push(day); idx[ds] = day;
  }
  const unplanned = [], noEst = [];
  let after = 0;
  for (const t of db().tasks) {
    if (!A.visible(t) || !A.isOpen(t) || !A.dimOk(t)) continue;
    if (!t.estimateMin) { noEst.push(t); continue; }
    const al = allocate(t, td);
    if (al.unplanned) { unplanned.push(t); continue; }
    const pr = A.subj(t.subjectId)?.priority || 0;
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

/* ---------- Rendu : ligne de tâche et panneau détails ---------- */
A.hooks.taskRow.push(t => {
  if (t.archived || !on('chrono')) return '';
  const run = !!t.timerStart, real = t.realMin || 0;
  const tip = `Temps réel : ${fmtDur(real) || '0min'}${t.estimateMin ? ' / estimé ' + fmtDur(t.estimateMin) : ''}`;
  if (!run && !A.isOpen(t)) return real ? `<span class="cc-real" title="${tip}">${fmtDur(real)}</span>` : '';
  const over = t.estimateMin && real > t.estimateMin;
  return `<button class="cc-timer${run ? ' on' : ''}${over ? ' over' : ''}" data-act="cc-timer" title="${run ? 'Arrêter le chrono' : 'Démarrer le chrono'} · ${tip}">${run ? STOP : PLAY}<span${run ? ` data-cc-tick="${t.id}"` : ''}>${run ? clock(elapsedSec(t)) : (real ? fmtDur(real) : '')}</span></button>`;
});

A.hooks.drawer.push(t => {
  if (!on('chrono')) return '';
  const run = !!t.timerStart, real = t.realMin || 0, est = t.estimateMin || 0;
  const pct = est ? Math.round(real / est * 100) : 0;
  const logs = (t.timeLogs || []).slice().sort((a, b) => (b.start || b.date || '').localeCompare(a.start || a.date || '')).slice(0, 12);
  const fmtLog = l => {
    const d = l.date ? parseYmd(l.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
    const h = l.start && l.kind === 'timer' ? ' · ' + new Date(l.start).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
    return `<div class="cc-log" data-logid="${l.id}"><span>${d}${h}</span><span class="hint">${l.kind === 'timer' ? 'chrono' : 'saisi'}</span><b>${fmtDur(l.min)}</b><button class="icon" data-act="cc-log-del" title="Retirer cette ligne (le temps réel est corrigé)">✕</button></div>`;
  };
  return `<div class="f cc-box"><label>Temps passé</label>
    <div class="cc-head">
      <button class="btn${run ? ' cc-stop' : ' primary'}" data-act="cc-timer">${run ? STOP + ' Arrêter' : PLAY + ' Démarrer le chrono'}</button>
      ${run ? `<span class="cc-big" data-cc-tick="${t.id}">${clock(elapsedSec(t))}</span>` : ''}
      <span class="cc-sum"><b>${fmtDur(real) || '0min'}</b>${est ? ` / ${fmtDur(est)} estimées` : ''}</span>
    </div>
    ${est ? `<div class="cc-gauge${pct > 100 ? ' over' : ''}" title="${pct}% du temps estimé"><i style="width:${Math.min(pct, 100)}%"></i></div>` : ''}
    <div class="cc-add">
      <span class="hint">Ajouter à la main :</span>
      <button class="chip" data-act="cc-add" data-min="15">+15min</button>
      <button class="chip" data-act="cc-add" data-min="30">+30min</button>
      <button class="chip" data-act="cc-add" data-min="60">+1h</button>
      <input data-cc-in="min" placeholder="durée" title="ex. 1h30, 45min">
      <input type="date" data-cc-in="date" value="${today()}" title="Jour où le temps a été passé">
      <button class="btn" data-act="cc-add">Ajouter</button>
    </div>
    ${logs.length ? `<div class="cc-logs">${logs.map(fmtLog).join('')}${(t.timeLogs || []).length > logs.length ? `<div class="hint">… et ${t.timeLogs.length - logs.length} plus anciennes</div>` : ''}</div>` : ''}
  </div>`;
});

/* ---------- Vue Charge ---------- */
let selDay = null;
function prioColor(p) { return `var(--p${p})`; }
function planLabel(t, al) {
  if (al.overdue) return 'en retard';
  const m = t.plan && t.plan.mode;
  if (m === 'daily' && t.plan.dailyMin) return fmtDur(t.plan.dailyMin) + '/jour' + (al.late ? ', finit après l\'échéance' : '');
  if (m === 'spread') return 'réparti jusqu\'au ' + parseYmd(t.deadline).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  return 'jour de l\'échéance';
}
function chart(days, compact) {
  const max = Math.max(settings().workdayMin, ...days.map(d => d.load)) * 1.08;
  const h = v => (v / max * 100).toFixed(2) + '%';
  return `<div class="cc-chart${compact ? ' compact' : ''}">${days.map(d => {
    const over = d.load > d.cap;
    const dt = parseYmd(d.date);
    const segs = [['fixed', d.fixedMin], [1, d.byPrio[1]], [2, d.byPrio[2]], [3, d.byPrio[3]], [0, d.byPrio[0]]]
      .filter(x => x[1] > 0)
      .map(([k, v]) => `<i class="cc-seg ${k === 'fixed' ? 'fx' : ''}" style="height:${h(v)};${k === 'fixed' ? '' : `background:${prioColor(k)}`}"></i>`).join('');
    const title = `${longDate(d.date)} : ${fmtDur(d.load) || '0'} prévues${d.cap ? ' sur ' + fmtDur(d.cap) : ' (jour non travaillé)'}`;
    const tag = compact ? 'span' : 'button';
    return `<${tag} class="cc-col${d.work ? '' : ' off'}${over ? ' over' : ''}${!compact && selDay === d.date ? ' sel' : ''}${d.date === today() ? ' td' : ''}"${compact ? '' : ` data-act="cc-day" data-d="${d.date}"`} title="${esc(title)}">
      <span class="cc-val">${d.load ? fmtDur(d.load) : ''}</span>
      <span class="cc-bar">${d.cap ? `<span class="cc-cap" style="bottom:${h(d.cap)}"></span>` : ''}${segs}</span>
      <span class="cc-lbl">${dt.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '')}<b>${dt.getDate()}</b></span>
    </${tag}>`;
  }).join('')}</div>`;
}
const legend = () => `<div class="cc-legend">
  <span><i class="fx"></i>Créneaux fixes, congés, fériés</span>
  ${[1, 2, 3].map(p => `<span><i style="background:${prioColor(p)}"></i>${A.PRIO[p].short} ${A.PRIO[p].name}</span>`).join('')}
  <span><i style="background:var(--p0)"></i>Boîte de réception</span>
  <span><i class="cap"></i>Capacité du jour</span>
</div>`;

function dayDetail(d) {
  const over = d.load > d.cap;
  const free = d.cap - d.load;
  return `<div class="card cc-detail">
    <h3>${longDate(d.date).replace(/^./, c => c.toUpperCase())}</h3>
    <p>${fmtDur(d.load) || '0min'} prévues${d.cap ? ` sur ${fmtDur(d.cap)} · <span class="${over ? 'cc-red' : 'cc-green'}">${over ? 'surcharge de ' + fmtDur(-free) : 'libre ' + (fmtDur(free) || '0min')}</span>` : ' · jour non travaillé'}</p>
    <div class="list">
      ${d.fixed.map(sl => `<div class="task cc-item" style="--pc:var(--faint)"><span class="cc-fxdot"></span><span class="title">${esc(sl.title || 'Créneau fixe')}</span><span class="hint">${esc(describeSlot(sl))}</span><b class="cc-min">${fmtDur(sl.durMin)}</b></div>`).join('')}
      ${d.items.map(({ t, min, pr, al }) => { const s = A.subj(t.subjectId); return `<div class="task cc-item" data-tid="${t.id}" style="--pc:var(--p${pr})">
        <span class="title">${esc(t.title || 'Sans titre')}</span>
        <span class="hint">${s ? esc(s.title) : 'Boîte de réception'} · <span class="${al.overdue || al.late ? 'cc-red' : ''}">${planLabel(t, al)}</span></span>
        <b class="cc-min">${fmtDur(min)}</b>
        <button class="icon" data-act="details" title="Détails et réglage de la répartition">${A.ICON.more}</button>
      </div>`; }).join('')}
      ${!d.fixed.length && !d.items.length ? '<div class="empty">Rien de prévu ce jour-là.</div>' : ''}
    </div>
  </div>`;
}

function slotRow(sl) {
  const wk = sl.freq === 'weekly' || sl.freq === 'biweekly';
  const needStart = sl.freq !== 'daily' && sl.freq !== 'weekly';
  return `<div class="cc-slot" data-slid="${sl.id}">
    <input class="inline cc-st" data-cc-slot="title" data-k="sl-t-${sl.id}" value="${esc(sl.title)}" placeholder="Nom (ex. Réunion d'équipe)">
    <input class="inline est" data-cc-slot="dur" data-k="sl-d-${sl.id}" value="${esc(fmtDur(sl.durMin))}" placeholder="durée" title="Durée (ex. 1h, 30min, 1j)">
    <select class="cc-sel" data-cc-slot="freq" data-k="sl-f-${sl.id}">${Object.entries(FREQ).map(([k, l]) => `<option value="${k}" ${k === sl.freq ? 'selected' : ''}>${l}</option>`).join('')}</select>
    ${wk ? `<span class="cc-days">${WD_ORDER.map(x => `<button class="${(sl.days || []).includes(x) ? 'on' : ''}" data-act="cc-slot-day" data-wd="${x}" title="${WD_LONG[x]}">${WD[x]}</button>`).join('')}</span>` : ''}
    <label class="cc-dl">${sl.freq === 'once' ? 'le' : needStart ? 'à partir du' : 'du'} <input type="date" class="date" data-cc-slot="start" data-k="sl-s-${sl.id}" value="${sl.start || ''}"></label>
    ${sl.freq !== 'once' ? `<label class="cc-dl">jusqu'au <input type="date" class="date" data-cc-slot="end" data-k="sl-e-${sl.id}" value="${sl.end || ''}" title="Laisser vide si sans fin"></label>` : ''}
    <span class="hint cc-desc">${esc(describeSlot(sl))}</span>
    <button class="icon" data-act="cc-slot-archive" title="Archiver ce créneau">${A.ICON.archive}</button>
  </div>`;
}

A.views.charge = () => {
  const st = settings();
  const n = db().ui.ccRange || 14;
  const fc = forecast(n);
  if (!selDay || !fc.days.some(d => d.date === selDay)) selDay = today();
  const work = fc.days.filter(d => d.work);
  const wk = fc.days.slice(0, 7);
  const sum = (arr, k) => arr.reduce((a, d) => a + d[k], 0);
  const overDays = fc.days.filter(d => d.load > d.cap);
  const td = fc.days[0];
  const act = slots().filter(s => !s.archived), arch = slots().filter(s => s.archived);
  const fixedWeek = sum(wk, 'fixedMin');
  return `<h1>Charge de travail</h1>
    <p class="sub">Temps restant des tâches ouvertes, réparti selon le réglage de chaque tâche, plus tes créneaux fixes.</p>
    <div class="toolbar">
      <div class="chips">${[7, 14, 28].map(x => `<button class="chip ${x === n ? 'on' : ''}" data-act="cc-range" data-n="${x}">${x} jours</button>`).join('')}</div>
    </div>
    ${A.dimsBar()}
    <div class="stats">
      <div class="stat ${td.load > td.cap ? 'late' : 'today'}"><div class="v">${fmtDur(td.load) || '0'}</div><div class="l">aujourd'hui${td.cap ? ' sur ' + fmtDur(td.cap) : ''}</div></div>
      <div class="stat"><div class="v">${fmtDur(sum(wk, 'load')) || '0'}</div><div class="l">sur 7 jours, capacité ${fmtDur(sum(wk, 'cap')) || '0'}${fixedWeek ? ` dont ${fmtDur(fixedWeek)} de fixe` : ''}</div></div>
      <div class="stat ${overDays.length ? 'late' : ''}"><div class="v">${overDays.length}</div><div class="l">jour${overDays.length > 1 ? 's' : ''} en surcharge sur ${n}</div></div>
      <div class="stat"><div class="v">${fc.unplanned.length + fc.noEst.length}</div><div class="l">tâches non comptées (sans échéance ou sans durée)</div></div>
    </div>
    <div class="card cc-chart-card">${chart(fc.days)}${legend()}
      ${fc.after ? `<p class="hint" style="margin:8px 0 0">${fmtDur(fc.after)} de travail sont prévues après ces ${n} jours.</p>` : ''}
    </div>
    ${dayDetail(fc.days.find(d => d.date === selDay))}
    ${fc.unplanned.length || fc.noEst.length ? `<details class="sec"><summary><span class="chev">${A.ICON.chev}</span>Non comptées dans la charge<span class="cnt">${fc.unplanned.length + fc.noEst.length}</span></summary>
      <p class="hint" style="margin:0 0 8px 4px">Ajoute une durée estimée, et une échéance ou un temps par jour, pour qu'elles apparaissent dans le graphique.</p>
      <div class="list">${[...fc.noEst.map(t => [t, 'sans durée estimée']), ...fc.unplanned.map(t => [t, 'sans échéance (' + fmtDur(remaining(t)) + ')'])].map(([t, why]) => { const s = A.subj(t.subjectId); return `<div class="task cc-item" data-tid="${t.id}" style="--pc:var(--p${s ? s.priority : 0})">
        <span class="title">${esc(t.title || 'Sans titre')}</span><span class="hint">${s ? esc(s.title) : 'Boîte de réception'} · ${why}</span>
        <button class="icon" data-act="details" title="Détails">${A.ICON.more}</button></div>`; }).join('')}</div>
    </details>` : ''}
    <div class="card"><h3>Créneaux fixes</h3>
      <p>Le temps pris chaque semaine par ce qui n'est pas une tâche : réunions récurrentes, points d'équipe… Il est retiré de ta capacité. Un jour entièrement pris ne reçoit pas de tâche réparties. ${on('pointage') ? `Les congés posés dans l'onglet <a href="#pointage">Pointage</a> et les jours fériés sont retirés automatiquement.` : ''}</p>
      <div class="cc-slots">${act.map(slotRow).join('') || '<div class="empty">Aucun créneau fixe pour le moment.</div>'}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
        <button class="btn primary" data-act="cc-slot-add">+ Ajouter un créneau</button>
        ${on('pointage') ? '<a class="btn" href="#pointage" data-act="pt-tab" data-t="conges">+ Congé / absence</a>' : ''}
      </div>
      ${arch.length ? `<details class="cc-arch"><summary class="hint">${arch.length} créneau${arch.length > 1 ? 'x' : ''} archivé${arch.length > 1 ? 's' : ''}</summary>
        ${arch.map(sl => `<div class="cc-slot" data-slid="${sl.id}"><span class="cc-st">${esc(sl.title)}</span><span class="hint">${fmtDur(sl.durMin)} · ${esc(describeSlot(sl))}</span><button class="btn" data-act="cc-slot-restore">Restaurer</button></div>`).join('')}</details>` : ''}
    </div>
    <div class="card"><h3>Ma semaine type</h3>
      <div class="cc-settings">
        <label>Capacité d'une journée <input class="inline est" data-cc-set="workday" data-k="cc-wd" value="${esc(fmtDur(st.workdayMin))}" title="Temps de travail disponible par jour (sert aussi pour « 1j »)"></label>
        <span>Semaine type : ${esc(WD_ORDER.filter(x => A.calendrier().semaine.includes(x)).map(x => WD_LONG[x].slice(0, 3) + '.').join(' '))} <a href="#donnees" class="cc-cal-lien" data-act="cal-voir">Régler dans Données › Calendrier</a></span>
      </div>
    </div>`;
};
// Entrée dans le menu, juste après « Sujets »
if (!A.NAV.some(x => x[0] === 'charge')) {
  const i = A.NAV.findIndex(x => x[0] === 'sujets');
  A.NAV.splice(i + 1, 0, ['charge', 'Charge', 'chart', 'charge']);
}

// Bandeau des 7 prochains jours sur le tableau de bord
const origDash = A.views.dashboard;
A.views.dashboard = () => {
  const html = origDash();
  if (!db().tasks.length || !on('charge')) return html;
  const fc = forecast(7);
  const strip = `<a class="card cc-mini" href="#charge" title="Ouvrir la vue Charge">
    <div class="cc-mini-h"><b>Charge des 7 prochains jours</b><span class="hint">voir le détail →</span></div>${chart(fc.days, true)}</a>`;
  const i = html.indexOf('<details class="sec');
  return i < 0 ? html + strip : html.slice(0, i) + strip + html.slice(i);
};

/* ---------- Événements ---------- */
function findSlot(el) { const r = el.closest('[data-slid]'); return r && slots().find(s => s.id === r.dataset.slid); }
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b || !b.dataset.act.startsWith('cc-')) return;
  const act = b.dataset.act;
  const tid = b.closest('[data-tid]')?.dataset.tid;
  const t = tid && A.task(tid);
  switch (act) {
    case 'cc-timer':
      e.preventDefault();
      if (!t) return;
      t.timerStart ? stopTimer(t) : startTimer(t);
      break;
    case 'cc-add': {
      if (!t) return;
      const box = b.closest('.cc-box');
      let min = b.dataset.min ? +b.dataset.min : parseDur(box.querySelector('[data-cc-in="min"]').value);
      if (!min || Number.isNaN(min)) { toast('Indique une durée, par exemple 1h30 ou 45min'); return; }
      const date = box.querySelector('[data-cc-in="date"]').value || today();
      A.modifier(`Temps ajouté : ${nom(t)}`, () => {
        addLog(t, { date, min, kind: 'manual' });
        if (t.status === 'todo' || t.status === 'waiting') A.setTaskField(t, 'status', 'doing');
      }, { toast: `${fmtDur(min)} ajoutées` });
      break;
    }
    case 'cc-log-del': {
      const id = b.closest('[data-logid]').dataset.logid;
      const i = (t.timeLogs || []).findIndex(l => l.id === id);
      if (i < 0) return;
      const l = t.timeLogs[i];
      A.modifier(`Temps retiré : ${nom(t)}`, () => {
        t.timeLogs.splice(i, 1);
        t.realMin = Math.max(0, (t.realMin || 0) - l.min);
      }, { toast: `${fmtDur(l.min)} retirées`, annuler: true });
      break;
    }
    case 'cc-range': db().ui.ccRange = +b.dataset.n; A.enregistrerAffichage(); A.render(); break;
    case 'cc-day': selDay = b.dataset.d; A.render(); break;
    case 'cc-slot-add': {
      const off = b.dataset.preset === 'off';
      const sl = off
        ? { id: uid(), title: 'Congés', durMin: settings().workdayMin, freq: 'once', days: [], start: addDays(today(), 1), end: null, archived: false, createdAt: nowIso() }
        : { id: uid(), title: '', durMin: 60, freq: 'weekly', days: [parseYmd(today()).getDay() || 1], start: today(), end: null, archived: false, createdAt: nowIso() };
      A.modifier(off ? 'Congé ajouté (Charge)' : 'Créneau fixe ajouté', () => { slots().push(sl); });
      setTimeout(() => { const el = document.querySelector(`[data-k="sl-${off ? 's' : 't'}-${sl.id}"]`); if (el) el.focus(); }, 0);
      break;
    }
    case 'cc-slot-day': {
      const sl = findSlot(b); if (!sl) return;
      const wd = +b.dataset.wd;
      A.modifier(`Jours du créneau ${nomCreneau(sl)}`, () => {
        sl.days = (sl.days || []).includes(wd) ? sl.days.filter(x => x !== wd) : [...(sl.days || []), wd];
      });
      break;
    }
    case 'cc-slot-archive': { const sl = findSlot(b); if (!sl) return; A.modifier(`Créneau archivé : ${nomCreneau(sl)}`, () => { sl.archived = true; }, { toast: 'Créneau archivé', annuler: true }); break; }
    case 'cc-slot-restore': { const sl = findSlot(b); if (!sl) return; A.modifier(`Créneau restauré : ${nomCreneau(sl)}`, () => { sl.archived = false; }); break; }
  }
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.ccSlot) {
    const sl = findSlot(el); if (!sl) return;
    const f = el.dataset.ccSlot, v = el.value;
    const m = f === 'dur' ? parseDur(v) : null;
    if (f === 'dur' && (!m || Number.isNaN(m))) { toast('Durée non comprise. Exemples : 1h, 30min, 1j'); el.value = fmtDur(sl.durMin); return; }
    A.modifier(() => `Créneau modifié : ${nomCreneau(sl)}`, () => {
      if (f === 'title') sl.title = v.trim();
      else if (f === 'dur') sl.durMin = m;
      else if (f === 'freq') { sl.freq = v; if (!sl.start) sl.start = today(); if ((v === 'weekly' || v === 'biweekly') && !(sl.days || []).length) sl.days = [parseYmd(sl.start).getDay()]; }
      else if (f === 'start') sl.start = v || null;
      else if (f === 'end') sl.end = v || null;
    }, { differe: true });
  } else if (el.dataset.ccSet === 'workday') {
    const m = parseDur(el.value);
    if (!m || Number.isNaN(m)) { toast('Durée non comprise. Exemple : 7h'); el.value = fmtDur(settings().workdayMin); return; }
    A.modifier('Capacité d\'une journée', () => { settings().workdayMin = m; }, { differe: true });
  }
});
document.addEventListener('keydown', e => {
  const el = e.target;
  if (e.key === 'Enter' && (el.dataset.ccSlot || el.dataset.ccSet)) { e.preventDefault(); el.blur(); }
  if (e.key === 'Enter' && el.dataset.ccIn) { e.preventDefault(); el.closest('.cc-box').querySelector('.btn[data-act="cc-add"]').click(); }
});

/* ---------- Chrono qui tourne : pastille flottante, titre de l'onglet ---------- */
const baseTitle = document.title;
let floatEl = document.getElementById('cc-float');
if (!floatEl) { floatEl = document.createElement('div'); floatEl.id = 'cc-float'; document.body.appendChild(floatEl); }
function renderFloat() {
  const r = on('chrono') && running()[0];
  if (!r) { floatEl.innerHTML = ''; document.title = baseTitle; return; }
  floatEl.innerHTML = `<div class="cc-float" data-tid="${r.id}">
    <span class="cc-pulse"></span>
    <button class="cc-ft" data-act="details" title="Ouvrir la tâche">${esc(r.title || 'Sans titre')}</button>
    <span class="cc-fclock" data-cc-tick="${r.id}">${clock(elapsedSec(r))}</span>
    <button class="btn cc-stop" data-act="cc-timer">${STOP} Arrêter</button>
  </div>`;
}
function tick() {
  const rs = running();
  if (!rs.length) { if (document.title !== baseTitle) document.title = baseTitle; return; }
  document.querySelectorAll('[data-cc-tick]').forEach(el => {
    const t = A.task(el.dataset.ccTick);
    if (t && t.timerStart) el.textContent = clock(elapsedSec(t));
  });
  document.title = '⏱ ' + clock(elapsedSec(rs[0])) + ' · ' + baseTitle;
}
window.addEventListener('todo:rendered', renderFloat);
// Chrono masqué alors qu'il tourne : on l'arrête et le temps déjà passé est gardé
window.addEventListener('todo:modules', e => {
  if (e.detail.id !== 'chrono' || e.detail.on) return;
  const rs = running();
  if (!rs.length) return;
  const before = rs.reduce((a, r) => a + (r.realMin || 0), 0);
  // Conséquence du réglage « Modules actifs », hors historique : annuler relancerait un chrono invisible
  A.modifier('Chrono arrêté (module masqué)', () => { rs.forEach(r => stopTimer(r, Date.now() - Date.parse(r.timerStart) <= 240 * 60000)); }, { historique: false });
  // Durée à garder refusée : le chrono continue, on garde donc le module affiché
  const kept = running().length;
  if (kept) db().settings.modules.chrono = true;
  const added = rs.reduce((a, r) => a + (r.realMin || 0), 0) - before;
  A.enregistrerAffichage(); A.render();
  // Après le message de index.html
  setTimeout(() => toast(kept ? 'Chrono gardé : arrête d\'abord le chrono en cours'
    : `Chrono masqué. Le chrono en cours a été arrêté${added ? ', ' + fmtDur(added) + ' ajoutées au temps réel' : ''}`), 10);
});
setInterval(tick, 1000);

A.render();
renderFloat();
})();
