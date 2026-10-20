// Sauvegarde automatique des données dans un dossier du PC.
// Fonctionne avec Edge et Chrome (accès aux fichiers). Ailleurs, on rappelle de faire l'export manuel.
// Fichiers écrits dans le dossier choisi :
//   todo-donnees.json                      → toujours la dernière version
//   sauvegardes/todo-AAAA-MM-JJ.json       → une copie par jour (historique)
(function () {
  'use strict';
  if (!window.todoApp) return;
  const app = window.todoApp;
  const LATEST = 'todo-donnees.json';
  const DIR = 'sauvegardes';
  const LAST_KEY = 'todo-noel-autosave-last';
  const supported = 'showDirectoryPicker' in window;

  let dir = null;          // dossier choisi
  let perm = 'none';       // none | prompt | granted | denied
  let lastWrite = null;
  let lastError = null;
  let timer = null;

  try { const l = localStorage.getItem(LAST_KEY); if (l) lastWrite = new Date(l); } catch (e) {}

  /* ---------- Mémoriser le dossier (IndexedDB) ---------- */
  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('todo-noel-fs', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('handles');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function idbGet(k) {
    const d = await idb();
    return new Promise((res, rej) => {
      const r = d.transaction('handles').objectStore('handles').get(k);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  async function idbSet(k, v) {
    const d = await idb();
    return new Promise((res, rej) => {
      const tx = d.transaction('handles', 'readwrite');
      v === undefined ? tx.objectStore('handles').delete(k) : tx.objectStore('handles').put(v, k);
      tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
    });
  }

  /* ---------- Écriture ---------- */
  async function writeFile(d, name, text) {
    const fh = await d.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(text);
    await w.close();
  }
  async function readLatest(d) {
    try {
      const fh = await d.getFileHandle(LATEST);
      return JSON.parse(await (await fh.getFile()).text());
    } catch (e) { return null; }
  }
  const isEmpty = data => !data.subjects.length && !data.tasks.length;

  async function write() {
    timer = null;
    if (!dir || perm !== 'granted') return;
    const data = app.getData();
    // Ne jamais écraser une sauvegarde avec des données vides
    if (isEmpty(data)) return;
    try {
      const text = JSON.stringify(Object.assign({ exportedAt: new Date().toISOString() }, data), null, 2);
      await writeFile(dir, LATEST, text);
      const sub = await dir.getDirectoryHandle(DIR, { create: true });
      await writeFile(sub, `todo-${app.today()}.json`, text);
      lastWrite = new Date();
      lastError = null;
      try { localStorage.setItem(LAST_KEY, lastWrite.toISOString()); } catch (e) {}
    } catch (e) {
      lastError = e.message;
      if (e.name === 'NotAllowedError' || e.name === 'SecurityError') perm = 'prompt';
    }
    paint();
  }
  function schedule(delay = 2000) {
    clearTimeout(timer);
    timer = setTimeout(write, delay);
  }

  /* ---------- Actions ---------- */
  async function choose() {
    try {
      const d = await window.showDirectoryPicker({ id: 'todo-noel', mode: 'readwrite' });
      dir = d; perm = 'granted';
      await idbSet('dir', d);
      // Si le dossier contient déjà une sauvegarde, proposer de la récupérer
      const existing = await readLatest(d);
      const cur = app.getData();
      if (existing && Array.isArray(existing.tasks) && Array.isArray(existing.subjects) && !isEmpty(existing)) {
        const when = existing.exportedAt ? new Date(existing.exportedAt).toLocaleString('fr-FR') : 'date inconnue';
        const msg = isEmpty(cur)
          ? `Une sauvegarde existe dans ce dossier (${existing.subjects.length} sujets, ${existing.tasks.length} tâches, du ${when}). La charger ?`
          : `Ce dossier contient déjà une sauvegarde (${existing.subjects.length} sujets, ${existing.tasks.length} tâches, du ${when}).\n\nOK = charger cette sauvegarde à la place des données actuelles\nAnnuler = garder les données actuelles et les sauvegarder ici`;
        if (confirm(msg)) { delete existing.exportedAt; app.replaceData(existing); }
      }
      await write();
    } catch (e) {
      if (e.name !== 'AbortError') alert('Impossible de choisir ce dossier : ' + e.message);
    }
    app.render();
  }
  async function resume() {
    if (!dir) return choose();
    try { perm = await dir.requestPermission({ mode: 'readwrite' }); } catch (e) { perm = 'denied'; }
    if (perm === 'granted') await write();
    app.render();
  }
  async function disable() {
    if (!confirm('Arrêter la sauvegarde automatique ? Les fichiers déjà écrits restent dans le dossier.')) return;
    dir = null; perm = 'none';
    await idbSet('dir', undefined);
    app.render();
  }
  async function restore() {
    if (!dir) return;
    if (perm !== 'granted') { await resume(); if (perm !== 'granted') return; }
    const existing = await readLatest(dir);
    if (!existing || !Array.isArray(existing.tasks)) { alert('Aucune sauvegarde trouvée dans ce dossier.'); return; }
    const cur = app.getData();
    if (!confirm(`Remplacer les données actuelles (${cur.subjects.length} sujets, ${cur.tasks.length} tâches) par la sauvegarde du dossier (${existing.subjects.length} sujets, ${existing.tasks.length} tâches) ?`)) return;
    delete existing.exportedAt;
    app.replaceData(existing);
  }

  /* ---------- Affichage ---------- */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hm = d => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const when = d => {
    if (!d) return 'jamais';
    const same = d.toDateString() === new Date().toDateString();
    return same ? "aujourd'hui à " + hm(d) : d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  };
  function daysSinceExport() {
    const le = app.getData().settings.lastExport;
    const ref = [le && new Date(le), lastWrite].filter(Boolean).sort((a, b) => b - a)[0];
    return ref ? Math.floor((Date.now() - ref) / 86400000) : null;
  }

  function paint() {
    const side = document.getElementById('autosave');
    if (side) {
      let h;
      if (dir && perm === 'granted') {
        h = lastError
          ? `<a href="#donnees" style="color:var(--danger)">⚠ Sauvegarde auto en erreur</a>`
          : `<span title="Dossier : ${esc(dir.name)}">💾 Sauvegarde auto · ${lastWrite ? hm(lastWrite) : 'en attente'}</span>`;
      } else if (dir) {
        h = `<button class="btn" data-act="autosave-resume" style="font-size:12px;padding:4px 8px;color:var(--warn)">⏸ Reprendre la sauvegarde auto</button>`;
      } else {
        const n = daysSinceExport();
        const late = n === null || n >= 3;
        h = `<a href="#donnees" style="color:${late ? 'var(--danger)' : 'inherit'}">${late ? '⚠ ' : ''}Sauvegarde ${n === null ? 'jamais faite' : n === 0 ? "faite aujourd'hui" : 'il y a ' + n + ' j'}</a>`;
      }
      side.innerHTML = h;
    }
    const card = document.getElementById('autosave-card');
    if (card) {
      let body;
      if (!supported) {
        body = `<p>Ce navigateur ne permet pas d'écrire automatiquement dans un dossier. Ouvre la page avec <b>Edge</b> ou <b>Chrome</b> pour l'activer. En attendant, fais un export manuel ci-dessous ; un rappel s'affiche à gauche au bout de 3 jours.</p>`;
      } else if (!dir) {
        body = `<p>Choisis ton dossier <b>ToDoList</b> : à chaque modification, la page y écrit <code>todo-donnees.json</code>, et garde une copie par jour dans <code>sauvegardes/</code>. Si une sauvegarde existe déjà dans le dossier, je te propose de la recharger.</p>
          <button class="btn primary" data-act="autosave-choose">Choisir le dossier de sauvegarde…</button>`;
      } else {
        const state = perm === 'granted'
          ? (lastError ? `<span style="color:var(--danger)">Erreur : ${esc(lastError)}</span>` : `<span style="color:var(--ok)">Active</span>`)
          : `<span style="color:var(--warn)">En pause : le navigateur redemande l'autorisation après sa fermeture.</span>`;
        body = `<p>Dossier : <b>${esc(dir.name)}</b> · ${state}<br>Dernière écriture : <b>${when(lastWrite)}</b></p>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${perm === 'granted' ? '<button class="btn" data-act="autosave-now">Sauvegarder maintenant</button>' : '<button class="btn primary" data-act="autosave-resume">Reprendre la sauvegarde</button>'}
            <button class="btn" data-act="autosave-restore">Recharger depuis le dossier…</button>
            <button class="btn" data-act="autosave-choose">Changer de dossier…</button>
            <button class="btn" data-act="autosave-off">Désactiver</button>
          </div>
          <p class="hint" style="margin:10px 0 0">Astuce : quand Edge ou Chrome demande l'accès, choisis « Autoriser à chaque visite » pour ne plus avoir à cliquer sur Reprendre.</p>`;
      }
      card.innerHTML = `<div class="card"><h3>Sauvegarde automatique</h3>${body}</div>`;
    }
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act^="autosave-"]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'autosave-choose') choose();
    else if (act === 'autosave-resume') resume();
    else if (act === 'autosave-now') write();
    else if (act === 'autosave-off') disable();
    else if (act === 'autosave-restore') restore();
  });
  window.addEventListener('todo:saved', () => schedule());
  window.addEventListener('todo:rendered', paint);
  // Filet de sécurité : une écriture toutes les 10 minutes et à la fermeture de l'onglet
  setInterval(() => { if (dir && perm === 'granted') write(); }, 10 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && timer) write(); });

  (async () => {
    if (supported) {
      try {
        dir = (await idbGet('dir')) || null;
        if (dir) perm = await dir.queryPermission({ mode: 'readwrite' });
      } catch (e) { dir = null; }
    }
    paint();
    if (dir && perm === 'granted') schedule(500);
  })();
})();
