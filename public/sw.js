// Nombre de la caché para nuestra aplicación.
const CACHE_NAME = 'my-home-doctor-app-cache-v1';
// Lista de recursos esenciales que se deben cachear durante la instalación.
const urlsToCache = [
  '/',
  '/login',
  '/dashboard',
  '/manifest.webmanifest',
  // Es importante no cachear aquí todos los archivos de CSS o JS,
  // ya que Next.js les asigna nombres únicos con hashes.
  // La estrategia de caché en el 'fetch' se encargará de ellos dinámicamente.
];

// 1. Evento 'install': Se dispara cuando el Service Worker se instala por primera vez.
self.addEventListener('install', (event) => {
  console.log('Service Worker: Instalando...');
  // Esperamos hasta que la promesa de abrir la caché y añadir los recursos se complete.
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caché abierta, añadiendo recursos esenciales.');
        return cache.addAll(urlsToCache);
      })
      .catch(error => {
        console.error('Service Worker: Fallo al cachear recursos durante la instalación:', error);
      })
  );
});

// 2. Evento 'activate': Se dispara cuando el Service Worker se activa.
// Se usa para limpiar cachés antiguas y asegurar que la nueva versión tome el control.
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activando...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Si el nombre de la caché no es el actual, la eliminamos.
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Limpiando caché antigua:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Forzamos al Service Worker a tomar el control inmediatamente.
  return self.clients.claim();
});


// 3. Evento 'fetch': Se dispara cada vez que la aplicación realiza una petición de red.
// Aquí implementamos la estrategia de "Network Falling Back to Cache".
self.addEventListener('fetch', (event) => {
    // Solo interceptamos peticiones GET.
    if (event.request.method !== 'GET') {
        return;
    }

    event.respondWith(
        // Primero, intentamos obtener el recurso de la red.
        fetch(event.request)
            .then((networkResponse) => {
                // Si la respuesta de la red es exitosa (ej. status 200)
                // clonamos la respuesta para poder guardarla en caché y devolverla al navegador.
                if (networkResponse && networkResponse.status === 200) {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME)
                        .then((cache) => {
                            // Guardamos la nueva respuesta en la caché.
                            cache.put(event.request, responseToCache);
                        });
                }
                // Devolvemos la respuesta original de la red.
                return networkResponse;
            })
            .catch(() => {
                // Si la petición a la red falla (ej. sin conexión),
                // intentamos servir el recurso desde la caché.
                console.log('Service Worker: Fallo de red. Intentando servir desde caché para:', event.request.url);
                return caches.match(event.request).then((cachedResponse) => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    // Si el recurso no está en caché, no podemos hacer nada.
                    // Para una mejor experiencia, aquí se podría devolver una página de "sin conexión" personalizada.
                    console.warn('Service Worker: Recurso no encontrado ni en red ni en caché:', event.request.url);
                });
            })
    );
});
