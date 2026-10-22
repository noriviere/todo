// Synchronisation PC ↔ téléphone via un dépôt GitHub privé.
// Les données sont écrites dans un fichier JSON du dépôt (API GitHub « contents »),
// avec un jeton personnel limité à ce dépôt, saisi une fois par appareil.
// Le localStorage reste la copie de travail : l'appli marche hors connexion et se resynchronise ensuite.
(function () {
  'use strict';
  // Pas de synchro en mode démo : les données d'exemple ne doivent jamais partir sur GitHub
  if (!window.todoApp || window.todoApp.demo) return;
  const app = window.todoApp;
  const CFG_KEY = 'todo-noel-sync';
  const BACKUP_KEY = 'todo-noel-v1-avant-import';
  const API = 'https://api.github.com';

  // cfg : { owner, repo, path, token, sha (version distante connue), synced (empreinte des données à cette version), at }
  let cfg = null;
  try { cfg = JSON.parse(localStorage.getItem(CFG_KEY)) || null; } catch (e) {}
  let busy = false, again = false, timer = null, lastError = null, applying = false;

  const saveCfg = () => { try { cfg ? localStorage.setItem(CFG_KEY, JSON.stringify(cfg)) : localStorage.removeItem(CFG_KEY); } catch (e) {} };
  const ready = () => !!(cfg && cfg.owner && cfg.repo && cfg.token);

  /* ---------- Données ---------- */
  // L'état d'affichage (ui) reste propre à chaque appareil
  function shared(data) {
    const d = Object.assign({}, data);
    delete d.ui;
    delete d.exportedAt;
    return d;
  }
  const fingerprint = data => JSON.stringify(shared(data));
  const isEmpty = d => !(d.subjects || []).length && !(d.tasks || []).length && !Object.keys((d.pointage && d.pointage.days) || {}).length;
  const dirty = () => !cfg.synced || fingerprint(app.getData()) !== cfg.synced;

  const toB64 = s => { const b = new TextEncoder().encode(s); let r = ''; for (let i = 0; i < b.length; i += 0x8000) r += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(r); };
  const fromB64 = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, '')), c => c.charCodeAt(0)));

  /* ---------- API GitHub ---------- */
  async function gh(method, body) {
    const url = `${API}/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${cfg.path.split('/').map(encodeURIComponent).join('/')}`;
    const r = await fetch(method === 'GET' ? url + '?t=' + Date.now() : url, {
      method,
      cache: 'no-store',
      headers: { Authorization: 'Bearer ' + cfg.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      body: body ? JSON.stringify(body) : undefined
    });
    if (method === 'GET' && r.status === 404) return null;
    if (!r.ok) {
      const err = new Error(r.status === 401 ? 'jeton refusé ou expiré' : r.status === 403 ? 'accès refusé à ce dépôt' : r.status === 404 ? 'dépôt introuvable' : 'erreur GitHub ' + r.status);
      err.status = r.status;
      throw err;
    }
    return r.json();
  }
  async function pull() {
    const f = await gh('GET');
    if (!f) return null;
    let text = f.content ? fromB64(f.content) : '';
    // Fichier > 1 Mo : l'API ne renvoie pas le contenu, on passe par le lien de téléchargement
    if (!text && f.download_url) text = await (await fetch(f.download_url, { cache: 'no-store', headers: { Authorization: 'Bearer ' + cfg.token } })).text();
    return { sha: f.sha, data: JSON.parse(text) };
  }
  async function push(sha) {
    const data = app.getData();
    const body = { message: 'Synchro ' + new Date().toLocaleString('fr-FR') + ' (' + deviceName() + ')', content: toB64(JSON.stringify(Object.assign({ exportedAt: new Date().toISOString() }, shared(data)), null, 1)) };
    if (sha) body.sha = sha;
    const res = await gh('PUT', body);
    cfg.sha = res.content.sha;
    cfg.synced = fingerprint(data);
    cfg.at = new Date().toISOString();
    saveCfg();
  }
  function apply(remote, sha, keepUndo) {
    const prev = localStorage.getItem(BACKUP_KEY);
    applying = true;
    try { app.replaceData(Object.assign({}, remote, { ui: app.getData().ui })); } finally { applying = false; }
    // Une synchro normale ne doit pas remplacer le point de retour « avant import »
    if (!keepUndo) { try { prev === null ? localStorage.removeItem(BACKUP_KEY) : localStorage.setItem(BACKUP_KEY, prev); } catch (e) {} }
    cfg.sha = sha;
    cfg.synced = fingerprint(app.getData());
    cfg.at = new Date().toISOString();
    saveCfg();
  }
  function deviceName() {
    return /Android|iPhone|iPad/i.test(navigator.userAgent) ? 'téléphone' : 'PC';
  }

  /* ---------- Synchro ---------- */
  async function sync(opts = {}) {
    if (!ready()) return;
    if (busy) { again = true; return; }
    if (!navigator.onLine) { lastError = 'hors connexion'; paint(); return; }
    busy = true; paint();
    try {
      const remote = await pull();
      const localDirty = dirty();
      const local = app.getData();
      if (!remote) {
        // Premier envoi : le fichier n'existe pas encore dans le dépôt
        if (!isEmpty(local)) await push(null);
      } else if (remote.sha === cfg.sha) {
        if (localDirty && !isEmpty(local)) await push(cfg.sha);
      } else if (!cfg.sha && isEmpty(local)) {
        apply(remote.data, remote.sha, false);
        app.toast && app.toast('Données récupérées depuis GitHub.');
      } else if (!localDirty) {
        apply(remote.data, remote.sha, false);
      } else if (fingerprint(remote.data) === fingerprint(local)) {
        cfg.sha = remote.sha; cfg.synced = fingerprint(local); saveCfg();
      } else {
        // Les deux côtés ont changé depuis la dernière synchro : on demande
        const rw = remote.data.exportedAt ? new Date(remote.data.exportedAt).toLocaleString('fr-FR') : 'date inconnue';
        const msg = `Tes données ont été modifiées sur cet appareil ET sur un autre depuis la dernière synchro.\n\n` +
          `GitHub (${rw}) : ${(remote.data.subjects || []).length} sujets, ${(remote.data.tasks || []).length} tâches\n` +
          `Cet appareil : ${local.subjects.length} sujets, ${local.tasks.length} tâches\n\n` +
          `OK = garder la version de GitHub (la version de cet appareil reste récupérable via « Revenir à l'état d'avant le dernier import » dans Données)\n` +
          `Annuler = garder la version de cet appareil et l'envoyer sur GitHub (l'ancienne reste dans l'historique GitHub)`;
        if (confirm(msg)) apply(remote.data, remote.sha, true);
        else await push(remote.sha);
      }
      lastError = null;
    } catch (e) {
      // 409/422 : quelqu'un a écrit entre notre lecture et notre écriture, on recommence
      if ((e.status === 409 || e.status === 422) && !opts.retried) { busy = false; return sync({ retried: true }); }
      lastError = e.message || String(e);
    }
    busy = false;
    paint();
    if (again) { again = false; schedule(500); }
  }
  function schedule(delay = 3000) {
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; sync(); }, delay);
  }

  /* ---------- Réglages ---------- */
  async function connect(form) {
    const v = n => form.querySelector(`[name="${n}"]`).value.trim();
    let repo = v('repo').replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '');
    const [owner, name] = repo.split('/');
    const token = v('token') || (cfg && cfg.token);
    if (!owner || !name) return alert('Indique le dépôt sous la forme  ton-pseudo/todo-donnees');
    if (!token) return alert('Colle le jeton GitHub.');
    cfg = { owner, repo: name, path: v('path') || 'donnees.json', token, sha: null, synced: null, at: null };
    saveCfg();
    lastError = null;
    await sync();
    if (lastError) alert('Connexion impossible : ' + lastError);
    app.render();
  }
  function disconnect() {
    if (!confirm('Arrêter la synchro sur cet appareil ? Les données restent ici et sur GitHub ; le jeton est effacé de cet appareil.')) return;
    cfg = null; saveCfg(); lastError = null;
    app.render();
  }

  /* ---------- Affichage ---------- */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hm = d => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  function ensure(id, afterId) {
    let el = document.getElementById(id);
    const ref = document.getElementById(afterId);
    if (!el && ref) { el = document.createElement('div'); el.id = id; ref.after(el); }
    return el;
  }
  function paint() {
    const side = ensure('sync-side', 'autosave');
    if (side) {
      side.innerHTML = !ready() ? '' : lastError
        ? `<a href="#donnees" style="color:var(--danger)">⚠ Synchro : ${esc(lastError)}</a>`
        : busy ? '<span>☁ Synchro…</span>'
        : `<span title="Dépôt ${esc(cfg.owner + '/' + cfg.repo)}">☁ Synchro${cfg.at ? ' · ' + hm(cfg.at) : ''}${dirty() ? ' · à envoyer' : ''}</span>`;
    }
    const card = ensure('sync-card', 'autosave-card');
    if (!card) return;
    let body;
    if (ready()) {
      const state = lastError ? `<span style="color:var(--danger)">Erreur : ${esc(lastError)}</span>`
        : busy ? 'Synchro en cours…' : `<span style="color:var(--ok)">Active</span>`;
      body = `<p>Dépôt : <b>${esc(cfg.owner + '/' + cfg.repo)}</b> · fichier <code>${esc(cfg.path)}</code> · ${state}<br>
        Dernière synchro : <b>${cfg.at ? new Date(cfg.at).toLocaleString('fr-FR') : 'jamais'}</b>${dirty() ? ' · des modifications attendent d\'être envoyées' : ''}</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn primary" data-act="sync-now">Synchroniser maintenant</button>
          <a class="btn" style="text-decoration:none;color:inherit" href="https://github.com/${esc(cfg.owner)}/${esc(cfg.repo)}/commits" target="_blank" rel="noopener">Historique des versions</a>
          <button class="btn" data-act="sync-off">Arrêter la synchro ici</button>
        </div>
        <p class="hint" style="margin:10px 0 0">La synchro se fait seule quelques secondes après chaque modification, à l'ouverture de l'appli et quand tu y reviens.</p>`;
    } else {
      const inp = 'style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font:inherit;box-sizing:border-box"';
      body = `<p>Retrouve les mêmes tâches sur ton PC et ton téléphone. Les données sont rangées dans un dépôt GitHub <b>privé</b>, à toi seul.</p>
        <form id="sync-form" style="display:grid;gap:10px;max-width:520px">
          <label>Dépôt privé des données<input name="repo" placeholder="ton-pseudo/todo-donnees" autocomplete="off" ${inp}></label>
          <label>Jeton GitHub (accès à ce seul dépôt)<input name="token" type="password" placeholder="github_pat_…" autocomplete="off" ${inp}></label>
          <input name="path" type="hidden" value="donnees.json">
          <div><button class="btn primary" type="submit">Connecter et synchroniser</button></div>
        </form>
        <p class="hint" style="margin:10px 0 0">Sur un nouvel appareil, connecte-toi avec le même dépôt : les données sont récupérées automatiquement.</p>`;
    }
    card.innerHTML = `<div class="card"><h3>Synchro PC ↔ téléphone</h3>${body}</div>`;
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act^="sync-"]');
    if (!b) return;
    if (b.dataset.act === 'sync-now') sync();
    else if (b.dataset.act === 'sync-off') disconnect();
  });
  document.addEventListener('submit', e => {
    if (e.target.id !== 'sync-form') return;
    e.preventDefault();
    connect(e.target);
  });
  window.addEventListener('todo:saved', () => { if (!applying && ready() && dirty()) { schedule(); paint(); } });
  window.addEventListener('todo:rendered', paint);
  window.addEventListener('online', () => sync());
  document.addEventListener('visibilitychange', () => {
    if (!ready()) return;
    // En quittant l'appli on envoie tout de suite ; en y revenant on récupère les changements
    if (document.visibilityState === 'hidden') { if (timer) { clearTimeout(timer); timer = null; sync(); } }
    else sync();
  });
  setInterval(() => { if (ready() && document.visibilityState === 'visible') sync(); }, 2 * 60 * 1000);

  paint();
  if (ready()) sync();
})();
