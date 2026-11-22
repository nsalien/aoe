// Service worker: toont de meldingen op je gsm (ook als het spel dicht is) en opent het spel als je erop tikt.
// Bewust zonder cache: het spel moet altijd de nieuwste versie laden.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Rijken van de Vallei', {
    body: d.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    tag: d.tag || 'rijken',
    renotify: true,
    requireInteraction: true,
    vibrate: [200, 100, 200, 100, 300],
    timestamp: d.at || Date.now(),
    data: { url: d.url || '/' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin) {
        w.postMessage({ type: 'notify-open', url });
        return w.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});
