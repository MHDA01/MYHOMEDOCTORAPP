// This file must be in the public folder.

// Import the Firebase app and messaging packages.
// These are imported via a CDN in a production environment.
// In this case, we are assuming Firebase SDKs are loaded globally.
// Make sure you have the Firebase SDKs included in your project.
importScripts('https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.6.1/firebase-messaging-compat.js');

// Your web app's Firebase configuration.
// IMPORTANT: Replace this with your project's actual Firebase config.
const firebaseConfig = {
  "projectId": "myhomedoctorapp",
  "appId": "1:138646987953:web:f0f8ee1d83efc34e4dae90",
  "storageBucket": "myhomedoctorapp.appspot.com",
  "apiKey": "AIzaSyAp65amh6olkSyo94sYxaBD9E2frbkws44",
  "authDomain": "myhomedoctorapp.firebaseapp.com",
  "messagingSenderId": "138646987953"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

/**
 * Handle incoming messages when the app is in the background or closed.
 * This is the primary function of the service worker for push notifications.
 */
messaging.onBackgroundMessage((payload) => {
  console.log(
    '[firebase-messaging-sw.js] Received background message ',
    payload
  );

  // Customize the notification here
  const notificationTitle = payload.notification.title || 'MiDoctorDeCasaApp';
  const notificationOptions = {
    body: payload.notification.body || 'Tienes un nuevo recordatorio.',
    icon: payload.notification.icon || 'https://i.postimg.cc/J7N5r89y/LOGO-1.png',
    data: {
        click_action: payload.notification.click_action || '/'
    }
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});


/**
 * Handle notification clicks.
 * This event listener determines what happens when a user clicks on the notification.
 */
self.addEventListener('notificationclick', (event) => {
    // Close the notification pop-up
    event.notification.close();

    const urlToOpen = event.notification?.data?.click_action || '/';

    // Check if there's an open window for this app
    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then((clientList) => {
            // If a window is already open, focus it
            for (const client of clientList) {
                // You can add more specific URL checks if needed
                if (client.url.includes(self.registration.scope) && 'focus' in client) {
                    return client.focus();
                }
            }
            // If no window is open, open a new one
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});
