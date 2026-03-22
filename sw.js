const CACHE = 'castwise-v1';
const SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:opsz,wght@9..40,400;9..40,500&display=swap',
];

// Install — cache app shell
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — cache-first for shell, network-first for API calls
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Always go network-first for API calls (weather, lakes, worker, iNat)
  const isAPI = ['open-meteo.com', 'hydro.nationalmap.gov', 'workers.dev',
                  'inaturalist.org', 'zippopotam.us', 'geonames.org',
                  'overpass-api.de', 'nominatim.openstreetmap.org'].some(h => url.hostname.includes(h));

  if (isAPI) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(JSON.stringify({ error: 'offline' }), {
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  // Cache-first for everything else (app shell, fonts, icons)
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
