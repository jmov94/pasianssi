// Offline-tuki: tiedostot tallennetaan välimuistiin ja näytetään sieltä heti.
// Uusi versio haetaan taustalla, ja se näkyy seuraavalla avauskerralla.
const CACHE = 'pasianssi-v5';
const FILES = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'wood.svg',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];

// Safari ei suostu näyttämään sivua vastauksesta, jossa on ollut uudelleenohjaus,
// joten tallennetaan siitä puhdas kopio.
async function clean(res) {
  if (!res.redirected) return res;
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
}

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(cache => Promise.all(FILES.map(async f => {
    const res = await fetch(f, { cache: 'reload' });
    if (!res.ok) throw new Error(f + ': ' + res.status);
    await cache.put(f, await clean(res));
  }))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('pasianssi-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (!url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const nav = e.request.mode === 'navigate';
    const cached = await cache.match(e.request, { ignoreSearch: true });
    const fresh = fetch(e.request).then(clean).then(res => {
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    });
    if (cached) {
      e.waitUntil(fresh.catch(() => {}));
      return cached;
    }
    // Ilman verkkoa mikä tahansa sivuosoite (esim. ?source=pwa) avaa pelin
    if (nav) return fresh.catch(() => cache.match('./'));
    return fresh;
  }));
});
