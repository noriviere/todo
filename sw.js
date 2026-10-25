// Mise en cache de l'appli pour l'ouvrir même sans réseau (téléphone).
// Réseau d'abord pour toujours avoir la dernière version, cache en secours.
// Les appels à GitHub (données) ne passent jamais par le cache.
const CACHE = 'todo-noel-app-v5';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    // no-cache : jamais de fichier périmé du cache HTTP (sinon mélange d'anciennes et de nouvelles versions après une mise en ligne)
    fetch(req, { cache: 'no-cache' })
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
