
// This basic service worker is used to show push notifications.

self.addEventListener('push', (event) => {
  const data = event.data.json();
  const title = data.title;
  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.openWindow('/')
  );
});
