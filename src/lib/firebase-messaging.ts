'use client';
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { app, db } from "./firebase";
import { doc, setDoc } from "firebase/firestore";

export const setupNotifications = async (userId: string, toast: (options: any) => void) => {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    console.log("Este navegador no soporta notificaciones push.");
    return;
  }
  
  try {
    const messaging = getMessaging(app);

    // 1. Solicitar permiso para notificaciones
    const permission = await Notification.requestPermission();
    
    if (permission === "granted") {
      console.log("Permiso de notificación concedido.");
      
      // 2. Obtener el token de registro de FCM
      const currentToken = await getToken(messaging, {
        vapidKey: "BOeZ6tQhBw4Z2dYq1_1o4p-gZ8jJ6mD6cQ3xR4eW2kY4vX8Z8jJ6mD6cQ3xR4eW2kY4vX8Z8jJ6mD6cQ3x",
      });

      if (currentToken) {
        console.log("Token FCM obtenido:", currentToken);
        
        // 3. Guardar el token en Firestore
        const userDocRef = doc(db, "users", userId);
        await setDoc(userDocRef, { notificationToken: currentToken }, { merge: true });
        console.log("Token guardado en Firestore.");

      } else {
        console.log("No se pudo obtener el token de registro. Solicite permiso para habilitar las notificaciones.");
        toast({
            variant: "destructive",
            title: "No se pueden recibir notificaciones",
            description: "Por favor, habilita los permisos de notificación en tu navegador para recibir recordatorios.",
        });
      }
    } else {
      console.log("Permiso de notificación denegado.");
    }

    // Escuchar mensajes en primer plano
    onMessage(messaging, (payload) => {
        console.log('Mensaje recibido en primer plano: ', payload);
        toast({
            title: payload.notification?.title,
            description: payload.notification?.body,
        });
    });

  } catch (error) {
    console.error("Error al configurar las notificaciones:", error);
    toast({
        variant: "destructive",
        title: "Error de Notificaciones",
        description: "No se pudieron inicializar los recordatorios push."
    })
  }
};
