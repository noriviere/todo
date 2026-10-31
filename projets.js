/* Gestion de projet : projets, étapes (sujets rattachés), dépendances, jalons, Gantt et export PDF.
   Module séparé de index.html : il s'appuie sur window.todoApp, ses points d'accroche et sur projets-plan.js (calculs). */
(function () {
'use strict';
const A = window.todoApp, PL = window.projetsPlan;
if (!A || !A.hooks || !PL) { console.warn('projets.js : index.html ou projets-plan.js manquant.'); return; }
const { esc, uid, today, toast } = A;
const db = () => A.getData();
// Module activable (Données › Modules actifs), désactivé par défaut
const on = () => !A.modOn || A.modOn('projet');
const view = () => location.hash.slice(1) || 'dashboard';
const coarse = () => !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);

A.ICON.print = A.ICON.print || '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/></svg>';

const safeColor = c => /^#[0-9a-f]{6}$/i.test(c || '') ? c : '#4f63e8';
const COLORS = ['#4f63e8', '#23915f', '#c77d0e', '#c2559b', '#0f8fa0', '#8e5bd8', '#d43a4a', '#5876b8'];

/* ---------- Données ---------- */
// Un projet est un sujet de premier niveau en mode projet ; ses étapes sont ses sous-sujets.
// pj garde chef de projet, couleur et jalons, même quand le mode projet est retiré.
const pjOf = s => s.pj && typeof s.pj === 'object' ? s.pj : (s.pj = { owner: '', color: '', milestones: [] });
const isProj = s => !!(s && s.isProject && !A.parentOf(s));
const projects = () => db().subjects.filter(s => isProj(s) && !s.archived).sort((a, b) => a.priority - b.priority || (a.order || 0) - (b.order || 0) || a.title.localeCompare(b.title, 'fr'));
const project = id => { const s = A.subj(id); return isProj(s) ? s : null; };
const stepsOf = pid => { const p = A.subj(pid); return p ? A.childrenOf(p) : []; };
const projectOfStep = s => { const p = A.parentOf(s); return isProj(p) && !p.archived ? p : null; };
// Jours ouvrés du calendrier commun (semaine type, hors fériés) : les congés de Noel ne décalent pas le Gantt
const workDays = () => A.calendrier().ouvre;
const milestonesOf = p => (pjOf(p).milestones || []).filter(m => !m.archived);
// Les étapes archivées (souvent terminées) restent des ancres pour celles qui en dépendent, sans être dessinées
function projectSchedule(p) {
  const all = A.childrenOf(p, true), archived = new Set(all.filter(s => s.archived).map(s => s.id));
  const sc = PL.schedule(all, milestonesOf(p), workDays());
  sc.order = sc.order.filter(id => !archived.has(id));
  sc.unplanned = sc.unplanned.filter(id => !archived.has(id));
  sc.alerts = sc.alerts.filter(a => !archived.has(a.subjectId));
  return sc;
}

// Avancement du projet = celui du sujet : ses tâches de niveau 1 et celles de ses étapes
const projectProgress = p => A.subjectStats(p).progress;

/* ---------- Onglet ---------- */
if (!A.NAV.some(x => x[0] === 'projets')) {
  const i = A.NAV.findIndex(x => x[0] === 'sujets');
  A.NAV.splice(i + 1, 0, ['projets', 'Projets', 'gantt', 'projet']);
}

function listView() {
  const ps = projects();
  const cards = ps.map(p => {
    const sc = projectSchedule(p), prog = projectProgress(p);
    const next = milestonesOf(p).filter(m => m.date >= today()).sort((a, b) => a.date.localeCompare(b.date))[0];
    const nSteps = stepsOf(p.id).length;
    return `<div class="card pj-card" data-pid="${p.id}" style="--pj:${safeColor(pjOf(p).color)}">
      <button class="pj-open" data-pj="open-project" title="Ouvrir le planning">
        <span class="pj-name">${esc(p.title)}</span>
        ${sc.alerts.length ? `<span class="pj-badge late" title="Un jalon est dépassé">⚠ ${sc.alerts.length} alerte${sc.alerts.length > 1 ? 's' : ''}</span>` : ''}
      </button>
      <div class="pj-meta">
        ${pjOf(p).owner ? `<span>${esc(pjOf(p).owner)}</span>` : ''}
        <span>${nSteps} étape${nSteps > 1 ? 's' : ''}</span>
        ${next ? `<span title="Prochain jalon">◆ ${esc(next.name)} · ${A.longDate(next.date)}</span>` : ''}
      </div>
      <div class="pj-prog"><span class="bar" title="${prog}%"><i style="width:${prog}%"></i></span><span>${prog}%</span></div>
      <button class="icon pj-arch" data-pj="unproject" title="Quitter le mode projet (le sujet et ses sous-sujets restent)">✕</button>
    </div>`;
  }).join('');
  return `<h1>Projets</h1>
    <p class="sub">Les sujets passés en mode projet : leurs sous-sujets sont les étapes du planning, avec leurs jalons.</p>
    <div class="toolbar"><button class="btn primary" data-pj="new-project">+ Nouveau projet</button></div>
    ${ps.length ? `<div class="pj-list">${cards}</div>` : `<div class="card"><p>Aucun projet pour le moment. Crée un projet, ou coche « Mode projet » dans la fiche d'un sujet (onglet Sujets) : ses sous-sujets deviennent les étapes.</p></div>`}`;
}

A.views.projets = () => {
  const p = db().ui.pjOpen && project(db().ui.pjOpen);
  return p && !p.archived ? detailView(p) : listView();
};

/* ---------- Détail d'un projet ---------- */
function alertsBanner(p, sc) {
  if (!sc.alerts.length) return '';
  const ms = new Map((pjOf(p).milestones || []).map(m => [m.id, m]));
  const lines = sc.alerts.map(a => {
    const m = ms.get(a.milestoneId), st = A.subj(a.subjectId);
    return `<li><b>${esc(m.name)}</b> (${fmt(m.date)}) est dépassé par <button class="linkish" data-pj="open-step" data-sid="${a.subjectId}">${esc(st ? st.title : '?')}</button>, qui finit le ${fmt(sc.byId[a.subjectId].end)}</li>`;
  }).join('');
  return `<div class="pj-alert" role="alert"><span class="pj-alert-ic">⚠</span><div><b>Jalon dépassé</b> : décale le jalon ou réorganise les étapes, puis ré-exporte le PDF pour prévenir l'équipe.<ul>${lines}</ul></div></div>`;
}

function milestonesSection(p, sc) {
  const steps = stepsOf(p.id), late = new Set(sc.alerts.map(a => a.milestoneId));
  const rows = milestonesOf(p).sort((a, b) => (a.date || '').localeCompare(b.date || '')).map(m => `
    <div class="pj-ms ${late.has(m.id) ? 'late' : ''}" data-mid="${m.id}">
      <span class="pj-dia" aria-hidden="true">◆</span>
      <input class="inline" data-pjm="name" data-k="pjmn-${m.id}" value="${esc(m.name)}" aria-label="Nom du jalon">
      <input type="date" class="date" data-pjm="date" data-k="pjmd-${m.id}" value="${esc(m.date || '')}" aria-label="Date du jalon">
      ${late.has(m.id) ? '<span class="pj-badge late">dépassé</span>' : ''}
      <button class="icon" data-pj="archive-milestone" title="Archiver le jalon">${A.ICON.archive}</button>
      ${steps.length ? `<div class="pj-after"><span class="pj-lbl">À finir avant</span>${steps.map(o => `<label class="pj-chip"><input type="checkbox" data-pj-before="${o.id}" ${(m.before || []).includes(o.id) ? 'checked' : ''}><span>${esc(o.title)}</span></label>`).join('')}</div>` : ''}
    </div>`).join('');
  return `<section class="card pj-sec"><h3>Jalons</h3>
    <p class="pj-hint">Dates fixes du projet (livraison, paiements…). Ils ne bougent jamais seuls : une alerte prévient si une étape les dépasse.</p>
    ${rows}
    ${(pjOf(p).milestones || []).filter(m => m.archived).map(m => `<div class="pj-ms arc" data-mid="${m.id}"><span class="pj-dia" aria-hidden="true">◇</span><span>${esc(m.name)} · archivé</span><button class="btn" data-pj="restore-milestone">Restaurer</button></div>`).join('')}
    <div class="pj-ms-add">
      <input data-pjm="new-name" data-k="pjm-new-name" placeholder="+ Nouveau jalon (ex. Livraison machine)" aria-label="Nom du nouveau jalon">
      <input type="date" class="date" data-pjm="new-date" data-k="pjm-new-date" aria-label="Date du nouveau jalon">
      <button class="btn" data-pj="add-milestone">Ajouter</button>
    </div>
  </section>`;
}

function detailView(p) {
  const sc = projectSchedule(p), prog = projectProgress(p);
  const pj = pjOf(p);
  return `<div class="pj-detail" data-pid="${p.id}" style="--pj:${safeColor(pj.color)}">
    <button class="btn pj-back" data-pj="back">← Projets</button>
    <h1>${esc(p.title)}</h1>
    <div class="pj-head">
      <label class="pj-f">Nom <input data-pjh="name" data-k="pjh-name" value="${esc(p.title)}"></label>
      <label class="pj-f">Chef de projet <input data-pjh="owner" data-k="pjh-owner" value="${esc(pj.owner || '')}" placeholder="—"></label>
      <label class="pj-f">Couleur <input type="color" data-pjh="color" value="${esc(safeColor(pj.color))}"></label>
      <span>${stepsOf(p.id).length} étape(s) · avancement ${prog}%</span>
      <button class="linkish" data-pj="open-step" data-sid="${p.id}" title="Le sujet du projet, avec ses tâches de niveau 1">Voir le sujet</button>
      <button class="linkish" data-pj="unproject" title="Le sujet et ses sous-sujets restent, avec leur planning">Quitter le mode projet</button>
    </div>
    ${alertsBanner(p, sc)}
    <div class="toolbar"><button class="btn primary" data-pj="new-step">+ Nouvelle étape</button></div>
    ${ganttSection(p, sc)}
    ${milestonesSection(p, sc)}
  </div>`;
}

/* ---------- Gantt ---------- */
const T = ymd => Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10));
const dd = (a, b) => Math.round((T(b) - T(a)) / 864e5);
const shift = (ymd, n) => new Date(T(ymd) + n * 864e5).toISOString().slice(0, 10);
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const PPD = { week: 22, month: 5 };   // pixels par jour des deux échelles prêtes à l'emploi
const ZMIN = 0.6, ZMAX = 40;           // zoom libre : de quelques années à quelques jours à l'écran
const clampPpd = v => Math.min(ZMAX, Math.max(ZMIN, v));
// Repères adaptés au zoom : semaines, mois, ou trimestres quand les mois deviennent trop étroits
const tickMode = ppd => ppd >= 10 ? 'week' : ppd >= 1.4 ? 'month' : 'quarter';
// Début de frise calé sur le premier repère : lundi, 1er du mois ou 1er du trimestre
const alignLo = (d, mode) => mode === 'quarter' ? d.slice(0, 5) + String(Math.floor((+d.slice(5, 7) - 1) / 3) * 3 + 1).padStart(2, '0') + '-01'
  : mode === 'month' ? d.slice(0, 8) + '01' : shift(d, -((new Date(T(d)).getUTCDay() + 6) % 7));
const ROW = 40, HEAD = 34;

// Une couleur par responsable (ordre alphabétique), gris sans responsable ; le nom est toujours écrit à côté
function whoColors(steps) {
  const names = [...new Set(steps.map(s => (s.who || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
  return new Map(names.map((n, i) => [n, COLORS[i % COLORS.length]]));
}
const colorOf = (s, wc) => wc.get((s.who || '').trim()) || 'var(--p0)';

// Moteur de rendu : dessine une liste de lignes génériques (étapes, jalons ; tâches plus tard)
function renderGantt(p, sc, { scale = 'week', ppd: zoom = 0, compact = false, fit = 0, fitH = 0 } = {}) {
  const mk = `pj-arr-${fit ? 'print-' : ''}${p.id}`;   // id unique : la page imprimée a sa propre flèche
  const steps = stepsOf(p.id), byStep = new Map(steps.map(s => [s.id, s]));
  const rows = PL.buildRows(steps, sc, milestonesOf(p));
  if (!rows.length) return '';
  const ms = new Map(milestonesOf(p).map(m => [m.id, m]));
  const lateMs = new Set(sc.alerts.map(a => a.milestoneId));
  const wc = whoColors(steps), td = today();
  let lo = [td, ...rows.map(r => r.start)].sort()[0], hi = [td, ...rows.map(r => r.end)].sort().pop();
  lo = shift(lo, -3); hi = shift(hi, 10);
  // fit : largeur imposée (export PDF), la frise entière tient dans la page ; sinon le zoom choisi
  const mode = tickMode(fit ? fit / (dd(lo, hi) + 1) : zoom || PPD[scale] || PPD.week);
  lo = alignLo(lo, mode);
  const ppd = fit ? fit / (dd(lo, hi) + 1) : zoom || PPD[scale] || PPD.week;
  // fitH : hauteur imposée (export PDF) ; les lignes se resserrent pour que tout le Gantt tienne sur une page
  const RH = fitH ? Math.max(12, Math.min(ROW, Math.floor((fitH - HEAD) / rows.length))) : compact ? 46 : ROW;   // lignes plus hautes au doigt
  const BH = Math.min(24, Math.round(RH * .6));   // hauteur des barres
  const days = dd(lo, hi) + 1, W = days * ppd, H = HEAD + rows.length * RH;
  const X = d => dd(lo, d) * ppd, Y = i => HEAD + i * RH + RH / 2;
  const ticks = [];
  for (let d = lo; d <= hi; d = shift(d, 1)) {
    const t = new Date(T(d));
    const m = t.getUTCMonth(), y = t.getUTCFullYear();
    let lab = null;
    if (mode === 'week') { if (t.getUTCDay() === 1) lab = t.getUTCDate() + ' ' + MONTHS[m]; }
    else if (t.getUTCDate() === 1) {
      if (mode === 'month') lab = ppd * 30 >= 70 || m === 0 ? MONTHS[m] + ' ' + y : MONTHS[m];   // mois étroits : l'année seulement en janvier
      else if (m % 3 === 0) lab = 'T' + (m / 3 + 1) + ' ' + y;
    }
    if (lab != null) ticks.push(`<div class="pj-tick" style="left:${X(d)}px"><span>${lab}</span></div>`);
  }
  const idx = new Map(rows.map((r, i) => [r.kind + r.id, i]));
  const names = [], marks = [], arrows = [];
  rows.forEach((r, i) => {
    if (r.kind === 'jalon') {
      const m = ms.get(r.id), late = lateMs.has(r.id);
      names.push(`<div class="pj-g-name ms ${late ? 'late' : ''}" style="height:${RH}px"><span class="pj-dia">◆</span><span class="t">${esc(m.name)}</span></div>`);
      marks.push(`<div class="pj-g-ms ${late ? 'late' : ''}" data-mid="${m.id}" style="left:${X(r.start) + ppd / 2}px;top:${Y(i)}px" title="${esc(m.name)} · ${fmt(m.date)}${late ? ' · dépassé' : ''}"><i></i><span>${fmt(m.date)}</span></div>`);
      return;
    }
    const s = byStep.get(r.id), st = A.subjectStats(s), col = colorOf(s, wc);
    const late = r.end < td && st.status !== 'done' && st.status !== 'cancelled';
    const prev = (s.after || []).filter(id => sc.byId[id]);
    const label = `${esc(s.title)}${s.who ? ' · ' + esc(s.who) : ''} · ${fmt(r.start)} → ${fmt(r.end)} · ${st.progress}%${late ? ' · en retard' : ''}${prev.length ? ' · placée par ses dépendances' : ''}`;
    // Avancement aussi sous le nom : lisible même quand la barre est trop courte pour l'afficher
    names.push(`<button class="pj-g-name st ${late ? 'late' : ''}" data-pj="open-step" data-sid="${s.id}" style="height:${RH}px;--c:${col}" title="${label}"><span class="sw"></span><span class="t">${esc(s.title)}</span>${s.who ? `<span class="w">${esc(s.who)}</span>` : ''}<span class="pg"><span class="bar"><i style="width:${st.progress}%"></i></span><span class="pc">${st.progress} %</span></span></button>`);
    const w = (dd(r.start, r.end) + 1) * ppd;
    marks.push(`<button class="pj-bar ${late ? 'late' : ''} ${prev.length ? 'chained' : 'free'}" data-pj="open-step" data-sid="${s.id}" data-start="${r.start}" data-end="${r.end}"
      style="left:${X(r.start)}px;top:${Y(i) - BH / 2}px;height:${BH}px;width:${w}px;--c:${col}" title="${label}" aria-label="${label}">
      <i class="pj-fill" style="width:${st.progress}%"></i>${w >= 44 && BH >= 14 ? `<span>${st.progress}%</span>` : ''}${compact || fit || coarse() ? '' : '<b class="pj-grip" aria-hidden="true"></b>'}</button>`);
    prev.forEach(id => {
      const j = idx.get('etape' + id);
      if (j == null) return;
      // Fin du prédécesseur → début de l'étape, en coude dans l'intervalle entre les deux barres
      const x1 = X(sc.byId[id].end) + ppd, y1 = Y(j), x2 = X(r.start), y2 = Y(i), xm = x1 + Math.max(4, Math.min(10, (x2 - x1) / 2));
      arrows.push(`<path d="M${x1} ${y1}H${xm}V${y2}H${x2 - 1}" />`);
    });
  });
  const todayLine = td >= lo && td <= hi ? `<div class="pj-today" style="left:${X(td) + ppd / 2}px" title="Aujourd'hui"></div>` : '';
  // Au-delà d'une ligne de 12 px, le Gantt imprimé est réduit d'un bloc (zoom) pour rester sur une page
  const css = fitH ? ` style="--rh:${RH}px${H > fitH ? ';zoom:' + (fitH / H).toFixed(3) : ''}"` : '';
  return `<div class="pj-gantt ${compact ? 'compact' : ''}${fitH && RH < 24 ? ' dense' : ''}" data-mode="${mode}" data-lo="${lo}" data-ppd="${ppd}"${css}>
    <div class="pj-g-names"><div class="pj-g-head" style="height:${HEAD}px">Étape</div>${names.join('')}</div>
    <div class="pj-g-scroll"><div class="pj-g-track" style="width:${W}px;height:${H}px">
      <div class="pj-g-ticks" style="height:${H}px">${ticks.join('')}</div>
      ${rows.map((r, i) => `<div class="pj-g-row" style="top:${HEAD + i * RH}px;height:${RH}px"></div>`).join('')}
      ${todayLine}
      <svg class="pj-arrows" width="${W}" height="${H}" aria-hidden="true"><defs><marker id="${mk}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker></defs>
        ${arrows.join('').replace(/<path d/g, `<path marker-end="url(#${mk})" d`)}</svg>
      ${marks.join('')}
    </div></div>
  </div>`;
}

function legend(steps) {
  const wc = whoColors(steps);
  if (!wc.size) return '';
  return `<div class="pj-legend"><span class="pj-lbl">Qui</span>${[...wc].map(([n, c]) => `<span class="pj-leg"><i style="background:${c}"></i>${esc(n)}</span>`).join('')}</div>`;
}

// Vue liste : la même information que le Gantt, ligne par ligne (téléphone, lecture rapide)
function listRows(p, sc) {
  const steps = stepsOf(p.id), late = new Set(sc.alerts.map(a => a.subjectId)), lateMs = new Set(sc.alerts.map(a => a.milestoneId)), td = today();
  const items = PL.buildRows(steps, sc, milestonesOf(p)).map(r => {
    if (r.kind === 'jalon') {
      const m = milestonesOf(p).find(x => x.id === r.id);
      return `<li class="pj-li ms ${lateMs.has(m.id) ? 'late' : ''}"><span class="pj-dia">◆</span><div><b>${esc(m.name)}</b><span class="d">${fmt(m.date)}${lateMs.has(m.id) ? ' · dépassé' : ''}</span></div></li>`;
    }
    const s = A.subj(r.id), k = A.subjectStats(s);
    const isLate = r.end < td && k.status !== 'done' && k.status !== 'cancelled';
    return `<li class="pj-li ${isLate || late.has(s.id) ? 'late' : ''}"><button class="linkish" data-pj="open-step" data-sid="${s.id}">${esc(s.title)}</button>
      <div class="d">${s.who ? esc(s.who) + ' · ' : ''}${fmt(r.start)} → ${fmt(r.end)}${isLate ? ' · en retard' : ''}${late.has(s.id) ? ' · dépasse un jalon' : ''}</div>
      <span class="pj-prog"><span class="bar"><i style="width:${k.progress}%"></i></span>${k.progress}%</span></li>`;
  });
  return items.length ? `<ul class="pj-mlist">${items.join('')}</ul>` : '';
}

function ganttSection(p, sc) {
  const ui = db().ui, scale = ui.pjScale === 'month' ? 'month' : 'week', list = ui.pjView === 'list';
  const ppd = curPpd(), preset = ppd === PPD.week ? 'week' : ppd === PPD.month ? 'month' : '';
  const compact = !!(window.matchMedia && matchMedia('(max-width: 760px)').matches);
  const un = sc.unplanned.map(id => A.subj(id)).filter(Boolean);
  const body = list ? listRows(p, sc) : renderGantt(p, sc, { scale, ppd, compact });
  const seg = (act, cur, opts, label) => `<div class="theme pj-seg" role="group" aria-label="${label}">${opts.map(([k, l]) => `<button class="${k === cur ? 'on' : ''}" data-pj="${act}" data-v="${k}" aria-pressed="${k === cur}">${l}</button>`).join('')}</div>`;
  return `<section class="card pj-sec pj-gsec">
    <div class="pj-gbar"><h3>Planning</h3>
      <div class="pj-gtools">
        ${seg('pview', list ? 'list' : 'gantt', [['gantt', 'Gantt'], ['list', 'Liste']], 'Affichage')}
        ${list ? '' : `<div class="pj-zoom">${seg('scale', preset, [['week', 'Semaines'], ['month', 'Mois']], 'Échelle')}
          <div class="theme pj-seg pj-zbtn" role="group" aria-label="Zoom (Ctrl + molette, ou pincer)">
            <button data-pj="zoom" data-v="out" title="Dézoomer : plus de mois à l'écran (Ctrl + molette)" aria-label="Dézoomer" ${ppd <= ZMIN ? 'disabled' : ''}>−</button>
            <button data-pj="zoom" data-v="in" title="Zoomer (Ctrl + molette)" aria-label="Zoomer" ${ppd >= ZMAX ? 'disabled' : ''}>+</button>
            <button data-pj="zoom" data-v="all" title="Tout le projet dans la largeur de l'écran">Tout voir</button>
          </div></div>`}
        <button class="btn" data-pj="export-pdf" title="Version imprimable pour l'équipe : choisis « Enregistrer en PDF »">${A.ICON.print}Exporter en PDF</button>
      </div>
    </div>
    ${un.length ? `<div class="pj-unplanned"><span class="pj-lbl">À planifier</span>${un.map(s => `<button class="pj-chip" data-pj="open-step" data-sid="${s.id}">${esc(s.title)} · Planifier</button>`).join('')}</div>` : ''}
    ${body || '<p class="pj-hint">Aucune étape planifiée. Ouvre une étape et indique son début, puis sa durée ou sa fin.</p>'}
    ${list ? '' : legend(stepsOf(p.id))}
  </section>`;
}

/* ---------- Actions ---------- */
// Nouveau projet : un sujet de premier niveau, directement en mode projet
function newProject() {
  const name = (prompt('Nom du projet ?') || '').trim();
  if (!name) return;
  A.modifier(`Projet créé : « ${name} »`, () => {
    A.createSubject({ title: name, priority: 2, isProject: true,
      pj: { owner: '', color: COLORS[projects().length % COLORS.length], milestones: [] } });
  });
}
function setProject(s, on) {
  s.isProject = !!on;
  if (on && !pjOf(s).color) pjOf(s).color = COLORS[projects().length % COLORS.length];
  if (!on && db().ui.pjOpen === s.id) db().ui.pjOpen = null;
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-pj]');
  if (!b || !on()) return;
  const pid = b.closest('[data-pid]')?.dataset.pid;
  const p = pid && project(pid);
  switch (b.dataset.pj) {
    case 'new-project': newProject(); break;
    case 'unproject':
      if (!p || !confirm(`Quitter le mode projet pour « ${p.title} » ? Le sujet, ses sous-sujets, leur planning et les jalons sont gardés : il suffit de recocher « Mode projet » pour les retrouver.`)) return;
      A.modifier(`Mode projet retiré : « ${p.title} »`, () => { setProject(p, false); }, { toast: 'Mode projet retiré' });
      break;
    case 'open-project':
      if (!p) return;
      db().ui.pjOpen = p.id; A.enregistrerAffichage();
      if (view() === 'projets') { A.render(); window.scrollTo(0, 0); } else location.hash = 'projets';
      break;
    case 'new-step': if (p) newStep(p); break;
    case 'add-milestone': {
      if (!p) return;
      const box = b.closest('.pj-ms-add');
      const name = box.querySelector('[data-pjm="new-name"]').value.trim(), date = box.querySelector('[data-pjm="new-date"]').value;
      if (!name || !date) { toast('Indique un nom et une date pour le jalon'); return; }
      A.modifier(`Jalon ajouté : « ${name} »`, () => { (pjOf(p).milestones = pjOf(p).milestones || []).push({ id: uid(), name, date, before: [], archived: false }); });
      break;
    }
    case 'restore-milestone': {
      const m = p && (pjOf(p).milestones || []).find(x => x.id === b.closest('[data-mid]')?.dataset.mid);
      if (!m) return;
      A.modifier(`Jalon restauré : « ${m.name} »`, () => { m.archived = false; }, { toast: 'Jalon restauré' });
      break;
    }
    case 'archive-milestone': {
      const m = p && (pjOf(p).milestones || []).find(x => x.id === b.closest('[data-mid]')?.dataset.mid);
      if (!m) return;
      A.modifier(`Jalon archivé : « ${m.name} »`, () => { m.archived = true; }, { toast: 'Jalon archivé' });
      break;
    }
    case 'open-step': openStep(b.dataset.sid); break;
    case 'scale': db().ui.pjScale = b.dataset.v; db().ui.pjPpd = null; A.enregistrerAffichage(); A.render(); break;
    case 'zoom': {
      const g = b.closest('.pj-gsec')?.querySelector('.pj-gantt'), sc = g?.querySelector('.pj-g-scroll');
      if (!g || !sc) return;
      if (b.dataset.v === 'all') zoomAll(g, sc);
      else zoomTo(g, curPpd() * (b.dataset.v === 'in' ? 1.4 : 1 / 1.4), sc.clientWidth / 2);
      break;
    }
    case 'export-pdf': { const q = project(db().ui.pjOpen); if (q) exportPdf(q); break; }
    case 'pview': db().ui.pjView = b.dataset.v; A.enregistrerAffichage(); A.render(); break;
    case 'back':
      db().ui.pjOpen = null; A.enregistrerAffichage(); A.render();
      break;
  }
});

/* ---------- Étapes : les sous-sujets d'un sujet en mode projet ---------- */
const fmt = ymd => ymd ? new Date(ymd + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
const whoValues = () => [...new Set(db().subjects.filter(s => !s.archived && projectOfStep(s) && s.who).map(s => s.who.trim()))].sort((a, b) => a.localeCompare(b, 'fr'));

A.hooks.subjectBody.push(s => {
  if (!on()) return '';
  // Sujet de premier niveau : interrupteur « Mode projet »
  if (!A.parentOf(s)) {
    const n = A.childrenOf(s).length;
    return `<div class="pj-step pj-mode" data-pid="${s.id}"><label class="tog"><input type="checkbox" data-pjf="is-project" data-k="pjm-${s.id}" ${s.isProject ? 'checked' : ''}> Mode projet</label>
      ${s.isProject ? `<button class="btn" data-pj="open-project">${A.ICON.gantt}Ouvrir le planning</button><span class="pj-hint">${n} étape${n > 1 ? 's' : ''} : ses sous-sujets.</span>`
        : `<span class="pj-hint">Ses sous-sujets deviennent les étapes d'un planning Gantt, avec des jalons.</span>`}</div>`;
  }
  const p = projectOfStep(s);
  if (!p) return '';
  let html = `<div class="pj-step"><span class="pj-f pj-of" title="Étape du projet">${A.ICON.gantt}<b>${esc(p.title)}</b></span>`;
  {
    const steps = stepsOf(p.id), others = steps.filter(x => x.id !== s.id);
    const sc = projectSchedule(p), c = sc.byId[s.id], hasPrev = (s.after || []).some(id => id !== s.id && sc.byId[id]);
    const plan = s.plan || {};
    html += hasPrev
      ? `<span class="pj-f pj-calc" title="Placée par les étapes dont elle dépend">Début calculé : <b>${c ? fmt(c.start) : 'à planifier'}</b></span>`
      : `<label class="pj-f">Début <input type="date" data-pjf="start" data-k="pjs-${s.id}" value="${esc(plan.start || '')}"></label>`;
    html += `<label class="pj-f">Durée <input type="number" min="1" step="1" inputmode="numeric" data-pjf="dur" data-k="pjd-${s.id}" value="${plan.durDays || ''}" placeholder="1"> j ouvrés</label>`;
    html += c ? `<label class="pj-f pj-end" title="Choisis la fin : la durée se recalcule en jours ouvrés">Fin prévue <input type="date" data-pjf="end" data-k="pje-${s.id}" value="${c.end}" min="${c.start}"></label>`
      : '<span class="pj-f pj-end">À planifier : indique un début, puis une durée ou une fin</span>';
    if (hasPrev) html += `<label class="pj-f">Décalage <input type="number" min="0" step="1" inputmode="numeric" data-pjf="lag" data-k="pjl-${s.id}" value="${s.lagDays || ''}" placeholder="0"> j</label>`;
    html += `<label class="pj-f">Qui <input data-pjf="who" data-k="pjw-${s.id}" value="${esc(s.who || '')}" list="pj-who-${s.id}" placeholder="Production, Entreprise A…"></label>
      <datalist id="pj-who-${s.id}">${whoValues().map(v => `<option value="${esc(v)}">`).join('')}</datalist>`;
    if (others.length) html += `<div class="pj-after"><span class="pj-lbl">Commence après</span>${others.map(o => `<label class="pj-chip"><input type="checkbox" data-pj-after="${o.id}" ${(s.after || []).includes(o.id) ? 'checked' : ''}><span>${esc(o.title)}</span></label>`).join('')}</div>`;
  }
  return html + '</div>';
});

// En-tête du projet : nom, chef de projet, couleur
const CHAMPS_PROJET = {
  name: { nom: 'nom', poser: (p, v) => { if (v) p.title = v; } },
  owner: { nom: 'chef de projet', poser: (p, v) => { pjOf(p).owner = v; } },
  color: { nom: 'couleur', poser: (p, v) => { pjOf(p).color = safeColor(v); } }
};
document.addEventListener('change', e => {
  const el = e.target.closest('[data-pjh]');
  if (!el || !on()) return;
  const p = project(el.closest('[data-pid]')?.dataset.pid);
  if (!p) return;
  const v = el.value.trim(), c = CHAMPS_PROJET[el.dataset.pjh];
  if (c) A.modifier(`Projet « ${A.titre(p)} » : ${c.nom}`, () => { c.poser(p, v); });
});

// Jalons : nom, date, étapes à finir avant
document.addEventListener('change', e => {
  const el = e.target.closest('[data-mid] [data-pjm], [data-mid] [data-pj-before]');
  if (!el || !on()) return;
  const p = project(el.closest('[data-pid]')?.dataset.pid);
  const m = p && (pjOf(p).milestones || []).find(x => x.id === el.closest('[data-mid]').dataset.mid);
  if (!m) return;
  A.modifier(`Jalon modifié : « ${m.name} »`, () => {
    if (el.dataset.pjBefore) {
      m.before = (m.before || []).filter(x => x !== el.dataset.pjBefore);
      if (el.checked) m.before.push(el.dataset.pjBefore);
    } else if (el.dataset.pjm === 'name') { if (el.value.trim()) m.name = el.value.trim(); }
    else if (el.dataset.pjm === 'date') { if (el.value) m.date = el.value; }
  });
});

// Champs d'une étape (et interrupteur « Mode projet » d'un sujet de premier niveau)
const poserPlan = (s, x) => { s.plan = Object.assign({}, s.plan, x); };
const CHAMPS_ETAPE = {
  'is-project': { nom: 'mode projet', poser: (s, v, o) => setProject(s, o.coche) },
  start: { nom: 'début', poser: (s, v) => poserPlan(s, { start: v || null }) },
  dur: { nom: 'durée', poser: (s, v) => poserPlan(s, { durDays: v ? Math.max(1, Math.round(+v) || 1) : null }) },
  end: { nom: 'fin prévue', poser: (s, v, o) => poserPlan(s, { durDays: Math.max(1, workdaysBetween(o.debut, v)) }) },
  lag: { nom: 'décalage', poser: (s, v) => { s.lagDays = Math.max(0, Math.round(+v) || 0); } },
  who: { nom: 'qui', poser: (s, v) => { s.who = v.trim(); } }
};
document.addEventListener('change', e => {
  const el = e.target.closest('[data-pjf], [data-pj-after]');
  if (!el || !on()) return;
  const s = A.subj(el.closest('[data-sid]')?.dataset.sid);
  if (!s) return;
  const v = el.value;
  if (el.dataset.pjAfter) {
    const id = el.dataset.pjAfter;
    if (el.checked && PL.wouldCycle(A.childrenOf(A.parentOf(s), true), id, s.id)) { el.checked = false; toast('Ce lien créerait une boucle entre étapes'); return; }
    A.modifier(`Étape « ${A.titre(s)} » : commence après`, () => {
      s.after = (s.after || []).filter(x => x !== id);
      if (el.checked) s.after.push(id);
    });
    return;
  }
  const f = el.dataset.pjf, c = CHAMPS_ETAPE[f];
  if (!c || (f === 'is-project' && A.parentOf(s))) return;
  let debut = null;
  if (f === 'end') {   // fin choisie : la durée devient le nombre de jours ouvrés depuis le début (choisi ou calculé)
    const x = projectSchedule(projectOfStep(s)).byId[s.id];
    if (!x || !v) { A.render(); return; }
    if (v < x.start) { toast('La fin ne peut pas être avant le début de l\'étape'); A.render(); return; }
    debut = x.start;
  }
  A.modifier(f === 'is-project' ? `Mode projet ${el.checked ? 'activé' : 'retiré'} : « ${A.titre(s)} »` : `Étape « ${A.titre(s)} » : ${c.nom}`,
    () => { c.poser(s, v, { coche: el.checked, debut }); });
});

// Nouvelle étape depuis un projet : un sujet rattaché, ouvert dans l'onglet Sujets
let goTo = null;
function newStep(p) {
  const title = (prompt('Nom de la nouvelle étape ?') || '').trim();
  if (!title) return;
  const s = A.modifier(`Étape créée : « ${title} »`, () => A.createSubject({ title, priority: p.priority, code: p.code, secteur: p.secteur, produit: p.produit,
    parentId: p.id, plan: {}, after: [], lagDays: 0, who: '' }));
  openStep(s.id);
}
function openStep(sid) {
  A.expandTo(sid); A.enregistrerAffichage();
  goTo = sid;
  if (view() === 'sujets') A.render(); else location.hash = 'sujets';
}
window.addEventListener('todo:rendered', () => {
  if (!goTo || view() !== 'sujets') return;
  const sid = goTo; goTo = null;
  setTimeout(() => {
    const box = document.querySelector(`#main .subject[data-sid="${sid}"]`);
    if (!box) { toast('Cette étape est masquée par un filtre'); return; }
    box.scrollIntoView({ block: 'start', behavior: 'smooth' });
    box.classList.add('org-flash');
  }, 30);
});

/* ---------- Échéance ferme (cadenas) et garde-fou sur les tâches ---------- */
A.ICON.lock = A.ICON.lock || '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
function stepEnd(t) {   // fin calculée de l'étape de la tâche, ou null
  const s = t.subjectId && A.subj(t.subjectId), p = s && projectOfStep(s);
  const c = p && projectSchedule(p).byId[s.id];
  return c ? c.end : null;
}
A.hooks.taskRow.push(t => {
  if (!on()) return '';
  let h = '';
  if (t.hardDue && t.deadline) h += `<span class="pj-lock ${A.isOpen(t) && t.deadline < today() ? 'late' : ''}" title="Échéance ferme">${A.ICON.lock}</span>`;
  const end = t.deadline && A.isOpen(t) && stepEnd(t);
  if (end && t.deadline > end) h += `<span class="pj-warn" title="Après la fin prévue de l'étape (${fmt(end)})">⚠</span>`;
  return h;
});
A.hooks.drawer.push(t => !on() ? '' : `<div class="f"><label>Échéance</label>
    <label class="tog"><input type="checkbox" data-pj-hard ${t.hardDue ? 'checked' : ''}> Échéance ferme ${A.ICON.lock}</label>
    <span class="hint">Coche si la date est une vraie échéance, pas seulement un rappel pour y travailler.</span>
  </div>`);
document.addEventListener('change', e => {
  if (!e.target.matches('[data-pj-hard]')) return;
  const t = A.task(e.target.closest('[data-tid]')?.dataset.tid);
  if (!t) return;
  const v = e.target.checked;
  A.modifier(`Échéance ${v ? 'ferme' : 'non ferme'} : « ${A.titre(t)} »`, () => { t.hardDue = v; });
});

/* ---------- Export PDF : une page d'impression dédiée, puis la fenêtre d'impression du navigateur ---------- */
function exportPdf(p) {
  const sc = projectSchedule(p), steps = stepsOf(p.id), rows = PL.buildRows(steps, sc, milestonesOf(p));
  const lateMs = new Set(sc.alerts.map(a => a.milestoneId)), lateSteps = new Set(sc.alerts.map(a => a.subjectId));
  const stepRows = sc.order.map(id => A.subj(id)).concat(sc.unplanned.map(id => A.subj(id))).filter(Boolean).map(s => {
    const c = sc.byId[s.id], k = A.subjectStats(s);
    return `<tr class="${lateSteps.has(s.id) ? 'late' : ''}"><td>${esc(s.title)}</td><td>${esc(s.who || '—')}</td><td>${c ? fmt(c.start) : 'à planifier'}</td><td>${c ? fmt(c.end) : ''}</td><td class="n">${k.progress} %</td></tr>`;
  }).join('');
  const msRows = milestonesOf(p).sort((a, b) => a.date.localeCompare(b.date)).map(m =>
    `<tr class="${lateMs.has(m.id) ? 'late' : ''}"><td>◆ ${esc(m.name)}</td><td>${fmt(m.date)}</td><td>${lateMs.has(m.id) ? 'dépassé' : m.date < today() ? 'passé' : 'à venir'}</td></tr>`).join('');
  // Page imposée, quel que soit l'écran (téléphone compris) : A4 paysage, ou portrait quand il y a beaucoup d'étapes
  // pour garder des lignes lisibles. Largeur de la feuille fixe : l'affichage mobile de l'appli ne s'applique pas.
  const port = rows.length > 26, sheetW = port ? 696 : 1010, namesW = port ? 230 : 270;
  const fitH = (port ? 900 : 565) - (sc.alerts.length ? 25 : 0);
  document.getElementById('pj-print')?.remove();
  document.getElementById('pj-page')?.remove();
  const page = document.createElement('style');
  page.id = 'pj-page';
  page.textContent = `@page{size:A4 ${port ? 'portrait' : 'landscape'};margin:12mm}`;
  document.head.appendChild(page);
  const el = document.createElement('div');
  el.id = 'pj-print';
  el.className = port ? 'portrait' : 'landscape';
  el.style.setProperty('--sheet', sheetW + 'px');
  el.style.setProperty('--names', namesW + 'px');
  el.innerHTML = `<header><h1>${esc(p.title)}</h1><p>${pjOf(p).owner ? 'Chef de projet : ' + esc(pjOf(p).owner) + ' · ' : ''}Exporté le ${A.longDate(today())} · avancement ${projectProgress(p)} %</p></header>
    ${sc.alerts.length ? `<p class="pj-p-alert">⚠ ${sc.alerts.length} dépassement(s) de jalon, voir le tableau des jalons.</p>` : ''}
    ${renderGantt(p, sc, { fit: sheetW - namesW - 2, fitH }) || '<p>Aucune étape planifiée.</p>'}
    ${legend(steps)}
    <div class="pj-p-tables">
      <table class="pj-steps"><caption>Étapes</caption><thead><tr><th>Étape</th><th>Qui</th><th>Début</th><th>Fin</th><th>Avancement</th></tr></thead><tbody>${stepRows}</tbody></table>
      ${msRows ? `<table class="pj-mstab"><caption>Jalons</caption><thead><tr><th>Jalon</th><th>Date</th><th>État</th></tr></thead><tbody>${msRows}</tbody></table>` : ''}
    </div>`;
  document.body.appendChild(el);
  document.body.classList.add('pj-printing');
  window.print();
}
// Nettoyage au retour dans l'appli, pas à « afterprint » : sur Chrome Android, window.print() ne bloque pas et
// « afterprint » arrive avant que la page soit capturée, ce qui imprimait l'écran de l'appli à la place du PDF.
// La page d'impression est invisible à l'écran : la garder un peu ne gêne pas.
function cleanPrint() {
  document.getElementById('pj-print')?.remove();
  document.getElementById('pj-page')?.remove();
  document.body.classList.remove('pj-printing');
}
window.addEventListener('afterprint', () => {
  const at = Date.now();
  const back = () => {
    if (Date.now() - at < 1000) return;   // ignore le geste qui ferme la fenêtre d'impression
    ['pointerdown', 'keydown'].forEach(t => document.removeEventListener(t, back, true));
    cleanPrint();
  };
  ['pointerdown', 'keydown'].forEach(t => document.addEventListener(t, back, true));
});

/* ---------- Édition directe : glisser une étape libre, étirer sa fin (souris, pas sur écran tactile) ---------- */
let drag = null, swallowClick = false;
const workdaysBetween = (a, b) => A.calendrier().ouvresEntre(a, b);   // nombre de jours ouvrés de a à b inclus
document.addEventListener('pointerdown', e => {
  const bar = e.target.closest('.pj-bar');
  if (!bar || e.button !== 0 || coarse() || !on()) return;
  const resize = !!e.target.closest('.pj-grip');
  if (!resize && !bar.classList.contains('free')) return;
  const g = bar.closest('.pj-gantt');
  drag = { bar, resize, x0: e.clientX, ppd: +g.dataset.ppd, left: bar.offsetLeft, width: bar.offsetWidth, days: 0, moved: false };
  bar.setPointerCapture && bar.setPointerCapture(e.pointerId);
});
document.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x0;
  if (Math.abs(dx) > 4) drag.moved = true;
  if (!drag.moved) return;
  drag.days = Math.round(dx / drag.ppd);
  if (drag.resize) drag.bar.style.width = Math.max(drag.ppd, drag.width + drag.days * drag.ppd) + 'px';
  else drag.bar.style.left = drag.left + drag.days * drag.ppd + 'px';
  drag.bar.classList.add('dragging');
});
document.addEventListener('pointerup', () => {
  if (!drag) return;
  const { bar, resize, days, moved } = drag;
  drag = null;
  if (!moved) return;
  swallowClick = true; setTimeout(() => { swallowClick = false; }, 0);
  const s = A.subj(bar.dataset.sid);
  if (!s || !days) { A.render(); return; }
  const start = bar.dataset.start, end = bar.dataset.end;
  A.modifier(`Étape « ${A.titre(s)} » ${resize ? 'allongée ou raccourcie' : 'déplacée'} sur le planning`, () => {
    if (resize) {
      const newEnd = shift(end, days);
      s.plan = Object.assign({}, s.plan, { durDays: Math.max(1, newEnd < start ? 1 : workdaysBetween(start, newEnd)) });
    } else s.plan = Object.assign({}, s.plan, { start: PL.nextWorkday(shift(start, days), workDays()) });
  }, { lieu: { vue: 'projets', sid: s.id } });
});
// Un glisser ne doit pas ouvrir l'étape
document.addEventListener('click', e => { if (swallowClick && e.target.closest('.pj-gantt')) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);

// À l'ouverture, la frise se place sur aujourd'hui (un tiers de la largeur avant) ; ensuite elle garde la position choisie.
// La position est gardée en jours (date du bord gauche), pour rester au même endroit quand le zoom change.
const scrollPos = new Map();
const DAY0 = g => T(g.dataset.lo) / 864e5;
window.addEventListener('todo:rendered', () => {
  if (view() !== 'projets') return;
  document.querySelectorAll('#main .pj-gantt').forEach(g => {
    const sc = g.querySelector('.pj-g-scroll'), t = g.querySelector('.pj-today');
    if (!sc) return;
    const key = g.closest('[data-pid]')?.dataset.pid, ppd = +g.dataset.ppd;
    if (scrollPos.has(key)) sc.scrollLeft = (scrollPos.get(key) - DAY0(g)) * ppd;
    else if (t) sc.scrollLeft = Math.max(0, t.offsetLeft - sc.clientWidth / 3);
    sc.addEventListener('scroll', () => scrollPos.set(key, DAY0(g) + sc.scrollLeft / ppd), { passive: true });
  });
});

/* ---------- Zoom libre : boutons − / + / Tout voir, Ctrl + molette, pincement à deux doigts ---------- */
function curPpd() {
  const ui = db().ui;
  return clampPpd(+ui.pjPpd || PPD[ui.pjScale === 'month' ? 'month' : 'week']);
}
// Zoome en gardant fixe la date située à ax pixels du bord gauche de la frise
function zoomTo(g, ppd, ax) {
  ppd = clampPpd(Math.round(ppd * 100) / 100);
  const sc = g.querySelector('.pj-g-scroll'), old = +g.dataset.ppd;
  if (!sc || ppd === old) return;
  const key = g.closest('[data-pid]')?.dataset.pid, at = DAY0(g) + (sc.scrollLeft + ax) / old;
  scrollPos.set(key, at - ax / ppd);
  db().ui.pjPpd = ppd; A.enregistrerAffichage(); A.render();
}
function zoomAll(g, sc) {
  const p = project(g.closest('[data-pid]')?.dataset.pid);
  if (!p) return;
  const rows = PL.buildRows(stepsOf(p.id), projectSchedule(p), milestonesOf(p));
  if (!rows.length) return;
  const td = today(), lo = [td, ...rows.map(r => r.start)].sort()[0], hi = [td, ...rows.map(r => r.end)].sort().pop();
  // Même début que la frise (3 jours avant, aligné sur le repère) et 10 jours après : on garde le zoom dont les repères correspondent
  const w = sc.clientWidth;
  const fits = ['week', 'month', 'quarter'].map(m => [m, w / (dd(alignLo(shift(lo, -3), m), shift(hi, 10)) + 1)]);
  const ppd = (fits.find(([m, v]) => tickMode(v) === m) || fits[2])[1];
  scrollPos.set(g.closest('[data-pid]').dataset.pid, -1e9);   // bord gauche
  db().ui.pjPpd = clampPpd(Math.floor(ppd * 100) / 100); A.enregistrerAffichage(); A.render();
}
// Ctrl + molette (et pincement du pavé tactile, qui arrive en Ctrl + molette)
let wheelAcc = 0, wheelRaf = 0;
document.addEventListener('wheel', e => {
  if (!e.ctrlKey || !on()) return;
  const sc = e.target.closest?.('#main .pj-g-scroll');
  if (!sc) return;
  e.preventDefault();
  wheelAcc += e.deltaY;
  const ax = e.clientX - sc.getBoundingClientRect().left;
  if (!wheelRaf) wheelRaf = requestAnimationFrame(() => {
    wheelRaf = 0;
    const g = document.querySelector('#main .pj-gantt');
    if (g) zoomTo(g, +g.dataset.ppd * Math.exp(-wheelAcc * 0.004), ax);
    wheelAcc = 0;
  });
}, { passive: false });
// Pincement à deux doigts sur la frise (écran tactile)
const pinch = new Map();
let pinch0 = null;
document.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'touch' || !e.target.closest('#main .pj-g-scroll')) return;
  pinch.set(e.pointerId, e.clientX);
  if (pinch.size === 2) {
    const [a, b] = [...pinch.values()], g = document.querySelector('#main .pj-gantt');
    pinch0 = { d: Math.abs(a - b) || 1, ppd: +g.dataset.ppd, ax: (a + b) / 2 - g.querySelector('.pj-g-scroll').getBoundingClientRect().left };
  }
});
let pinchRaf = 0;
document.addEventListener('pointermove', e => {
  if (!pinch.has(e.pointerId)) return;
  pinch.set(e.pointerId, e.clientX);
  if (!pinch0 || pinch.size !== 2 || pinchRaf) return;
  pinchRaf = requestAnimationFrame(() => {
    pinchRaf = 0;
    const [a, b] = [...pinch.values()], g = document.querySelector('#main .pj-gantt');
    if (pinch0 && g) zoomTo(g, pinch0.ppd * (Math.abs(a - b) || 1) / pinch0.d, pinch0.ax);
  });
});
['pointerup', 'pointercancel'].forEach(t => document.addEventListener(t, e => { pinch.delete(e.pointerId); if (pinch.size < 2) pinch0 = null; }));

// Accès pour les étapes suivantes du module (même fichier)
Object.assign(A, { pj: { on, project, projects, stepsOf, projectSchedule, projectOfStep } });
A.render();
})();
