// Bump this with every deploy — matches the version in index.html
const VERSION = 'v0.135.4';
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
    'tile.openstreetmap.org', 'unpkg.com'
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

self.addEventListener('push', e => {
  let data = { title: 'CastWise', body: 'New notification available.' };
  if (e.data) {
    try {
      data = e.data.json();
    } catch (err) {
      data = { title: 'CastWise', body: e.data.text() };
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || 'icons/icon-192.png',
    badge: data.badge || 'icons/badgecw2-96.png', // New transparent monochrome icon
    data: data
  };

  const nPromise = self.registration.showNotification(data.title, options);

  // Notify open windows to refresh UI in real-time if the app is active
  const mPromise = clients.matchAll({ type: 'window' }).then(windowClients => {
    windowClients.forEach(client => {
      client.postMessage({ type: 'PUSH_RECEIVED', payload: data });
    });
  });

  e.waitUntil(Promise.all([nPromise, mPromise]));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const data = e.notification.data || {};
  let url = self.registration.scope;

  // Deep link based on the notification type
  if (data.type === 'friend_request') {
    url = new URL('#requests', self.registration.scope).href;
  }
  
  if (data.type === 'dm' && data.friend) {
    url = new URL('#chat-' + data.friend, self.registration.scope).href;
  }

  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(windowClients => {
      // If the app is already open, navigate it to the deep link and focus
      for (const client of windowClients) {
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          return client.navigate(url).then(c => c.focus());
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// Allow the page to trigger activation of a waiting SW
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
