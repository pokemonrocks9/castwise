// Bump this with every deploy — matches the version in index.html
const VERSION = 'v0.37.0';
const CACHE   = `castwise-${VERSION}`;
const SHELL   = ['./', './index.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', e => {
  // Cache new shell immediately, then take over without waiting
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  // Delete ALL old caches so stale assets never serve
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Never cache API calls — always go to network
  const isAPI = [
    'open-meteo.com', 'hydro.nationalmap.gov', 'workers.dev',
    'inaturalist.org', 'zippopotam.us', 'geonames.org',
    'overpass-api.de', 'nominatim.openstreetmap.org',
    'discord.com', 'github.com', 'geocoding-api.open-meteo.com',
  ].some(h => url.hostname.includes(h));

  if (isAPI) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(JSON.stringify({ error: 'offline' }), { headers: { 'Content-Type': 'application/json' } })
      )
    );
    return;
  }

  // For the app shell — network first, fall back to cache
  // Network-first means updates are picked up immediately on next load
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// Allow the page to trigger activation of a waiting SW
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
