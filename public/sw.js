'use strict';

self.addEventListener('install', (event) => {
  console.log('Service Worker: Instalado');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activado');
  event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notificación clickeada');
  event.notification.close();

  // Enfoca la ventana de la app si está abierta
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      if (clientList.length > 0) {
        let client = clientList[0];
        for (let i = 0; i < clientList.length; i++) {
          if (clientList[i].focused) {
            client = clientList[i];
          }
        }
        return client.focus();
      }
      return self.clients.openWindow('/');
    })
  );
});

// Escuchador de notificaciones push (si se implementa en el futuro desde un servidor)
self.addEventListener('push', (event) => {
  console.log('Service Worker: Notificación Push recibida');
  
  const notificationData = event.data ? event.data.json() : {};
  
  const title = notificationData.title || 'MiDoctorDeCasaApp';
  const options = {
    body: notificationData.body || 'Tienes una nueva notificación.',
    icon: notificationData.icon || '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    ...notificationData
  };
  
  event.waitUntil(self.registration.showNotification(title, options));
});
