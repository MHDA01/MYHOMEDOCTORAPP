// Service worker de Firebase Cloud Messaging.
// Los valores de configuración son las mismas variables NEXT_PUBLIC_FIREBASE_*
// ya expuestas en el bundle del cliente (seguras de exponer, no son secretos).
// Un service worker no puede leer process.env, por eso van hardcodeadas aquí.

importScripts("https://www.gstatic.com/firebasejs/11.9.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.9.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAp65amh6olkSyo94sYxaBD9E2frbkws44",
  authDomain: "myhomedoctorapp.firebaseapp.com",
  projectId: "myhomedoctorapp",
  storageBucket: "myhomedoctorapp.firebasestorage.app",
  messagingSenderId: "138646987953",
  appId: "1:138646987953:web:8d668e0db76f20974dae90",
});

const messaging = firebase.messaging();

// Notificaciones recibidas mientras la app está en background/cerrada.
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "MyHomeDoctorApp";
  const options = {
    body: payload.notification?.body || "",
    icon: "/images/LOGO_1_transparent.png",
    data: payload.data || {},
  };
  self.registration.showNotification(title, options);
});

// Al hacer clic en la notificación, enfocar o abrir la app.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
      const existing = clientsArr.find((c) => "focus" in c);
      if (existing) return existing.focus();
      return self.clients.openWindow("/dashboard/teleorientacion");
    })
  );
});
