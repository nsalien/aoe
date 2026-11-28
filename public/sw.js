// Service worker: toont de meldingen op je gsm (ook als het spel dicht is) en opent het spel als je erop tikt.
// Bewust zonder cache: het spel moet altijd de nieuwste versie laden.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// {left} = resterende tijd (bv. 1:52) en {clock} = klokuur van aankomst, met de klok en tijdzone van deze gsm
function fill(text, at) {
  if (!text || !at) return text || '';
  const s = Math.max(0, Math.round((at - Date.now()) / 1000));
  // korter dan een uur: 1:52; langer (een aanval kan uren onderweg zijn): 2u 05m
  const left = s >= 3600 ? `${Math.floor(s / 3600)}u ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const clock = new Date(at).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return text.replace('{left}', left).replace('{clock}', clock);
}

// staat het spel open en in beeld? (dan zie je een afgewerkt bouwwerk al in het spel: geen melding)
async function gameVisible() {
  const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  return wins.some((w) => w.visibilityState === 'visible' && new URL(w.url).origin === self.location.origin);
}

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(showPush(d));
});

async function showPush(d) {
  if (d.kind === 'build' && await gameVisible()) return;
  return self.registration.showNotification(fill(d.title, d.at) || 'Rijken van de Vallei', {
    body: fill(d.body, d.at),
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    tag: d.tag || 'rijken',
    renotify: !d.quiet, // een bijwerking vervangt de melding zonder opnieuw te rinkelen
    silent: !!d.quiet,
    requireInteraction: d.kind !== 'build', // een aanval blijft staan tot je ze ziet; een afgewerkt bouwwerk niet
    vibrate: d.quiet ? undefined : d.kind === 'build' ? [180] : [300, 120, 300, 120, 500],
    timestamp: d.at || Date.now(),
    data: { url: d.url || '/' },
  });
}

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
