// Scripts for firebase and firebase messaging
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

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

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);

  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/apple-touch-icon.png' // Opcional: un ícono para la notificación
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
