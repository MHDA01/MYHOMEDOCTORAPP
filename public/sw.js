// public/sw.js
try {
  importScripts('/firebase-messaging-sw.js');
} catch (e) {
  console.error('Error importing Firebase messaging service worker', e);
}
