// Importar e inicializar el SDK de Firebase
self.importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
self.importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');


const firebaseConfig = {
  "projectId": "myhomedoctorapp",
  "appId": "1:138646987953:web:f0f8ee1d83efc34e4dae90",
  "storageBucket": "myhomedoctorapp.appspot.com",
  "apiKey": "AIzaSyAp65amh6olkSyo94sYxaBD9E2frbkws44",
  "authDomain": "myhomedoctorapp.firebaseapp.com",
  "messagingSenderId": "138646987953"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Manejar notificaciones en segundo plano
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Mensaje recibido en segundo plano:', payload);

  const notificationTitle = payload.notification?.title || 'Nueva notificación';
  const notificationOptions = {
    body: payload.notification?.body || 'Tienes un nuevo mensaje',
    icon: 'https://i.postimg.cc/J7N5r89y/LOGO-1.png',
    badge: 'https://i.postimg.cc/J7N5r89y/LOGO-1.png',
    data: payload.data,
    actions: [
      {
        action: 'view',
        title: 'Ver',
      },
      {
        action: 'close',
        title: 'Cerrar',
      }
    ],
    vibrate: [200, 100, 200],
    requireInteraction: true
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});


// Manejar clics en notificaciones
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notificación clickeada:', event);
  
  event.notification.close();
  
  const clickAction = event.notification.data?.clickAction || '/';

  if (event.action === 'close') {
      return;
  }
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
            // Si el cliente ya está abierto y es visible, enfocarlo.
            if (new URL(client.url).pathname === new URL(clickAction, self.location.origin).pathname && 'focus' in client) {
                return client.focus();
            }
        }
        // Si no hay un cliente abierto con esa URL, abrir una nueva ventana.
        if (clients.openWindow) {
          return clients.openWindow(clickAction);
        }
      })
  );
});

// Estrategia de caché para PWA
const CACHE_NAME = 'myhomedoctorapp-cache-v1';

self.addEventListener('install', (event) => {
  console.log('[Service Worker] Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll([
        '/',
        '/manifest.webmanifest',
        'https://i.postimg.cc/J7N5r89y/LOGO-1.png'
      ]);
    })
  );
});

self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activando...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
