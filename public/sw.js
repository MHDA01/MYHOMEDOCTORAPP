
const CACHE_NAME = 'my-home-doctor-cache-v1';
const DYNAMIC_CACHE_NAME = 'dynamic-cache-v1';

// URLs a cachear durante la instalación.
// Es importante incluir las rutas principales y los recursos estáticos.
const urlsToCache = [
  '/',
  '/login',
  '/dashboard',
  '/manifest.webmanifest',
  '/favicon.ico'
];

self.addEventListener('install', event => {
  console.log('Service Worker: Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Abriendo caché y cacheando archivos estáticos');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  console.log('Service Worker: Activando...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME && cache !== DYNAMIC_CACHE_NAME) {
            console.log('Service Worker: Limpiando caché antigua', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // No cachear peticiones a Firebase ni extensiones de Chrome.
  if (url.origin.startsWith('https://firestore.googleapis.com') || url.protocol === 'chrome-extension:') {
    return;
  }
  
  // Estrategia Stale-While-Revalidate para páginas y assets de Next.js
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(DYNAMIC_CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(request);
        
        const fetchPromise = fetch(request).then(networkResponse => {
          // Si la respuesta es válida, la cacheamos
          if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => {
          // Si la red falla, y no hay nada en caché para esta petición específica
          // (por ejemplo, un recurso de _next/static), podemos intentar devolver
          // la página de inicio como fallback para la navegación.
          if (request.mode === 'navigate') {
            return caches.match('/');
          }
        });

        // Devolvemos la respuesta de la caché si existe, mientras la red actualiza.
        // Si no está en caché, esperamos a la respuesta de la red.
        return cachedResponse || fetchPromise;
      })
    );
    return;
  }
  
  // Estrategia Cache First para recursos externos como fuentes e imágenes
  event.respondWith(
    caches.match(request).then(cachedResponse => {
      return cachedResponse || fetch(request).then(networkResponse => {
        // Cachear recursos externos válidos para futuras visitas
        const cacheable = networkResponse.clone();
        caches.open(DYNAMIC_CACHE_NAME).then(cache => {
          cache.put(request, cacheable);
        });
        return networkResponse;
      });
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
