
'use strict';

/* eslint-env browser, serviceworker, es6 */

self.addEventListener('push', function(event) {
  console.log('[Service Worker] Push Recibido.');
  
  let data = {};
  if (event.data) {
    data = event.data.json();
  }

  const title = data.title || 'MiDoctorDeCasaApp';
  const options = {
    body: data.body || 'Tienes una nueva notificación.',
    icon: data.icon || '/icon-192x192.png',
    badge: data.badge || '/badge.png',
    data: data.data || { url: '/' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event) {
  console.log('[Service Worker] Clic en notificación recibido.');

  event.notification.close();

  const urlToOpen = event.notification.data.url || '/';

  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then(function(clientList) {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
