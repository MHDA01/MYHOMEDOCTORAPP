import { doc, setDoc } from 'firebase/firestore';
import { app, db } from '@/lib/firebase';
import { COLECCION_TUTOR } from '@/lib/constants';

/**
 * Pide permiso de notificaciones, registra el service worker de FCM, obtiene el
 * token del dispositivo y lo guarda en Cuentas_Tutor/{uid}.notificationToken
 * (mismo campo que ya leen las Cloud Functions de recordatorios y consejos diarios).
 *
 * Importa 'firebase/messaging' dinámicamente: ese paquete asume globals de
 * navegador (self/navigator) y rompe el server-render si se importa de forma
 * estática en un componente que Next.js renderiza primero en el servidor.
 *
 * Seguro de llamar múltiples veces: si el permiso ya fue denegado u otorgado,
 * simplemente no vuelve a preguntar (comportamiento nativo del navegador).
 */
export async function requestNotificationPermission(uid: string): Promise<{ granted: boolean; error?: string }> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { granted: false, error: 'Este navegador no soporta notificaciones.' };
  }

  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey) {
    return { granted: false, error: 'Notificaciones no configuradas (falta VAPID key).' };
  }

  try {
    const { getMessaging, getToken, isSupported } = await import('firebase/messaging');

    const supported = await isSupported();
    if (!supported) {
      return { granted: false, error: 'Este navegador no soporta Firebase Cloud Messaging.' };
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { granted: false, error: 'Permiso de notificaciones no concedido.' };
    }

    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });

    if (!token) {
      return { granted: false, error: 'No se pudo obtener el token de notificaciones.' };
    }

    await setDoc(doc(db, COLECCION_TUTOR, uid), { notificationToken: token }, { merge: true });

    return { granted: true };
  } catch (error) {
    console.error('[PushNotifications] Error solicitando permiso:', error);
    return { granted: false, error: 'Ocurrió un error al activar las notificaciones.' };
  }
}
