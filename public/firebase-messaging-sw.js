/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

const firebaseConfig = {
  "projectId": "myhomedoctorapp",
  "appId": "1:138646987953:web:f0f8ee1d83efc34e4dae90",
  "storageBucket": "myhomedoctorapp.appspot.com",
  "apiKey": "AIzaSyAp65amh6olkSyo94sYxaBD9E2frbkws44",
  "authDomain": "myhomedoctorapp.firebaseapp.com",
  "messagingSenderId": "138646987953"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

// Notificaciones en background
messaging.onBackgroundMessage((payload) => {
  const { title, body, icon, badge, click_action } = payload.notification || {};
  const options = {
    body,
    icon: icon || 'https://i.postimg.cc/J7N5r89y/LOGO-1.png',
    badge: badge || 'https://i.postimg.cc/J7N5r89y/LOGO-1.png',
    data: { click_action: click_action || '/' }
  };
  self.registration.showNotification(title || 'Recordatorio', options);
});

// Manejar clics en la notificación
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification?.data?.click_action || '/';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
    for (const client of windowClients) {
      if (client.url.includes(self.registration.scope) && 'focus' in client) {
        return client.focus();
      }
    }
    if (clients.openWindow) {
      return clients.openWindow(url);
    }
  }));
});
