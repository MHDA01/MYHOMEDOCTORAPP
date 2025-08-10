// Define el nombre de la caché y los archivos a cachear.
const CACHE_NAME = 'my-home-doctor-app-cache-v1';
const urlsToCache = [
  '/',
  '/login',
  '/dashboard',
  '/manifest.webmanifest',
  '/favicon.ico',
  // Es posible que necesites agregar aquí rutas a tus archivos CSS y JS principales si no se cachean dinámicamente.
];

// Evento 'install': Se dispara cuando el Service Worker se instala por primera vez.
self.addEventListener('install', (event) => {
  // Espera a que la promesa dentro de waitUntil se resuelva.
  event.waitUntil(
    // Abre la caché con el nombre definido.
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Cache abierta');
        // Agrega todos los archivos definidos en urlsToCache a la caché.
        return cache.addAll(urlsToCache);
      })
      .catch((err) => {
        console.error('Fallo al cachear en la instalación:', err);
      })
  );
});

// Evento 'activate': Se dispara después de la instalación y cuando una nueva versión del SW toma el control.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    // Obtiene todas las claves de caché (nombres de cachés).
    caches.keys().then((cacheNames) => {
      return Promise.all(
        // Filtra y elimina las cachés antiguas que no coinciden con CACHE_NAME.
        cacheNames.filter(cacheName => {
          return cacheName.startsWith('my-home-doctor-app-cache-') && cacheName !== CACHE_NAME;
        }).map(cacheName => {
          return caches.delete(cacheName);
        })
      );
    })
  );
});

// Evento 'fetch': Se dispara cada vez que la aplicación realiza una petición de red.
self.addEventListener('fetch', (event) => {
  // Ignora las peticiones que no son GET.
  if (event.request.method !== 'GET') {
    return;
  }
  // Ignora las peticiones a Firestore y otros servicios de Google.
  if (event.request.url.includes('firestore.googleapis.com') || event.request.url.includes('google.com/recaptcha')) {
    return;
  }

  // Estrategia: Network Falling Back to Cache
  event.respondWith(
    // Intenta obtener el recurso de la red.
    fetch(event.request)
      .then((networkResponse) => {
        // Si la respuesta es exitosa, la clona y la guarda en la caché para futuras peticiones.
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });
        }
        return networkResponse;
      })
      .catch(() => {
        // Si la petición a la red falla (por ejemplo, sin conexión),
        // intenta obtener el recurso desde la caché.
        return caches.match(event.request)
          .then((cachedResponse) => {
            // Si se encuentra en la caché, la devuelve.
            if (cachedResponse) {
              return cachedResponse;
            }
            // Si no está ni en la red ni en la caché, la petición fallará.
            // Opcional: podrías devolver una página de "sin conexión" aquí.
          });
      })
  );
});
