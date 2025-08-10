'use client';
import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";
import { app, db } from "./firebase";
import { doc, setDoc } from "firebase/firestore";
import { toast } from "@/hooks/use-toast";

export const setupNotifications = async (userId: string) => {
  const supported = await isSupported();
  if (!supported) {
    console.log("Este navegador no soporta notificaciones push de Firebase.");
    // En iOS o navegadores no compatibles, simplemente no hacemos nada y evitamos errores.
    return;
  }
  
  try {
    // Esperamos a que el Service Worker esté listo y activo.
    const registration = await navigator.serviceWorker.ready;
    
    const messaging = getMessaging(app);

    // Solicitamos permiso al usuario.
    const permission = await Notification.requestPermission();
    
    if (permission === "granted") {
      console.log("Permiso de notificación concedido.");
      
      // Obtenemos el token de FCM.
      // La VAPID key debe ser la que se genera en la consola de Firebase
      // Project Settings > Cloud Messaging > Web configuration > Web Push certificates
      const currentToken = await getToken(messaging, {
        vapidKey: "BOeZ6tQhBw4Z2dYq1_1o4p-gZ8jJ6mD6cQ3xR4eW2kY4vX8Z8jJ6mD6cQ3xR4eW2kY4vX8Z8jJ6mD6cQ3x",
        serviceWorkerRegistration: registration,
      });

      if (currentToken) {
        console.log("Token FCM obtenido:", currentToken);
        
        // Guardamos el token en el documento del usuario en Firestore.
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

    // Escuchamos mensajes mientras la app está en primer plano.
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
