// Define a version for your cache
const CACHE_NAME = 'my-home-doctor-app-cache-v1';

// List the files you want to cache
const urlsToCache = [
  '/',
  '/login',
  '/dashboard',
  '/manifest.webmanifest',
  // Add other important assets like CSS, JS, and key images
];

// Install a service worker
self.addEventListener('install', event => {
  console.log('Service Worker: Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Cache abierto');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting()) // Activate the new SW immediately
  );
});

// Activate the service worker and clean up old caches
self.addEventListener('activate', event => {
  console.log('Service Worker: Activando...');
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Service Worker: Limpiando cache antiguo', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Intercept fetch requests
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Ignore non-http/https requests (like chrome-extension://)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }
  
  // Strategy: Network falling back to cache
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Check if we received a valid response
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        // IMPORTANT: Clone the response. A response is a stream
        // and because we want the browser to consume the response
        // as well as the cache consuming the response, we need
        // to clone it so we have two streams.
        const responseToCache = response.clone();

        caches.open(CACHE_NAME)
          .then(cache => {
            cache.put(event.request, responseToCache);
          });

        return response;
      })
      .catch(() => {
        // If the network request fails, try to get it from the cache.
        return caches.match(event.request)
          .then(response => {
            if (response) {
              return response;
            }
          });
      })
  );
});
