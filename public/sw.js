
// Este archivo es el punto de entrada para el service worker.
// Importa el script principal que maneja la lógica de Firebase Messaging.
try {
  importScripts('firebase-messaging-sw.js');
} catch (e) {
  console.error('Error al importar firebase-messaging-sw.js:', e);
}
