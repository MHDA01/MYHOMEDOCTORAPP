const CACHE_PREFIX = 'my-home-doctor-app-cache-';
const CACHE_NAME = `${CACHE_PREFIX}v7`;
const PRECACHE_URLS = ['/manifest.webmanifest', '/favicon.ico', '/images/LOGO_1_transparent.png'];

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('install', (event) => {
  // Sin skipWaiting() aquí a propósito: el SW nuevo se queda en espera hasta que
  // la app le manda SKIP_WAITING (ver components/app-update-manager.tsx). Antes
  // tomaba el control solo, y al hacerlo la página se recargaba encima del
  // usuario — en una app de chat eso significa perder lo que estaba escribiendo.
  // Ahora la actualización se aplica cuando la persona está fuera de la app, o
  // cuando ella misma acepta el aviso.
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      ).then(() => self.clients.claim())
    )
  );
});

// Guarda una copia en caché sin bloquear la respuesta.
function putInCache(request, response) {
  if (response && response.status === 200 && response.type === 'basic') {
    const copy = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  // El SW solo gestiona recursos del propio origen. Los de terceros (p. ej. la
  // CSS de iconos de cdnjs) los carga el navegador vía <link> bajo style-src; si
  // el SW los re-solicita con fetch(), la petición pasa a regirse por connect-src
  // del CSP —que no los incluye— y se bloquea con ERR_FAILED.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.hostname.includes('firebase') || url.hostname.includes('google') || url.hostname.includes('gstatic')) return;

  const destination = event.request.destination || '';

  // HTML (navegación) y código (script/style): NETWORK-FIRST.
  // Siempre se pide a la red la versión más reciente; la caché es solo respaldo
  // offline. Así cada deploy llega al usuario sin necesidad de hard-reset manual.
  if (event.request.mode === 'navigate' || destination === 'script' || destination === 'style') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          putInCache(event.request, networkResponse);
          return networkResponse;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          // Fallback final para navegaciones offline sin copia exacta.
          if (event.request.mode === 'navigate') {
            const shell = await caches.match('/');
            if (shell) return shell;
          }
          throw new Error('Sin red y sin copia en caché');
        })
    );
    return;
  }

  // Imágenes, fuentes, manifest y workers: CACHE-FIRST (pesados y estables;
  // priorizamos velocidad y ahorro de datos, revalidando solo si no hay copia).
  if (['font', 'image', 'manifest', 'worker'].includes(destination)) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(event.request).then((networkResponse) => {
          putInCache(event.request, networkResponse);
          return networkResponse;
        });
      })
    );
    return;
  }
});
