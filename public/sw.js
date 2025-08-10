// Importar el script de Firebase Messaging (le da al service worker las capacidades de recibir push)
importScripts('https://www.gstatic.com/firebasejs/9.2.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.2.0/firebase-messaging-compat.js');

// Configuración de Firebase (debe coincidir con la de tu app)
const firebaseConfig = {
  "projectId": "myhomedoctorapp",
  "appId": "1:138646987953:web:f0f8ee1d83efc34e4dae90",
  "storageBucket": "myhomedoctorapp.appspot.com",
  "apiKey": "AIzaSyAp65amh6olkSyo94sYxaBD9E2frbkws44",
  "authDomain": "myhomedoctorapp.firebaseapp.com",
  "messagingSenderId": "138646987953"
};

// Inicializar la app de Firebase en el Service Worker
firebase.initializeApp(firebaseConfig);

// Obtener una instancia del servicio de mensajería
const messaging = firebase.messaging();

// --- Lógica de PWA (caché, offline) ---

const CACHE_NAME = 'my-home-doctor-app-cache-v1';
// Lista de URLs a cachear cuando el Service Worker se instala.
const urlsToCache = [
  '/',
  '/manifest.webmanifest',
  // Es importante cachear los chunks de JS y CSS que Next.js genera.
  // Pero nombrar los archivos estáticamente es frágil.
  // La estrategia 'Network Falling Back to Cache' maneja esto dinámicamente.
];

// Evento 'install': se dispara cuando el SW se instala por primera vez.
self.addEventListener('install', (event) => {
  console.log('Service Worker: Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Cache abierto.');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting()) // Activa el nuevo SW inmediatamente
  );
});

// Evento 'activate': se dispara cuando el SW se activa.
// Es un buen lugar para limpiar cachés antiguas.
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activando...');
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Service Worker: Borrando caché antigua -> ', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
    .then(() => self.clients.claim()) // Toma control de las páginas abiertas
  );
});

// Evento 'fetch': se dispara cada vez que la aplicación realiza una petición de red.
self.addEventListener('fetch', (event) => {
  // Ignorar peticiones que no son GET y que no son http/https (ej. chrome-extension://)
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
    return;
  }

  // Estrategia: Network Falling Back to Cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Si la respuesta es válida, la clonamos y la guardamos en caché.
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });
        }
        return response;
      })
      .catch(() => {
        // Si la red falla, buscamos en la caché.
        return caches.match(event.request)
          .then((response) => {
            if (response) {
              return response;
            }
          });
      })
  );
});
