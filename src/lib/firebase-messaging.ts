'use client';
import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";
import { app, db } from "./firebase";
import { doc, setDoc } from "firebase/firestore";
import { toast } from "@/hooks/use-toast";

export const setupNotifications = async (userId: string, toast: (options: any) => void) => {
  const supported = await isSupported();
  if (!supported) {
    console.log("Este navegador no soporta notificaciones push de Firebase.");
    return;
  }
  
  try {
    const registration = await navigator.serviceWorker.ready;
    const messaging = getMessaging(app);
    const permission = await Notification.requestPermission();
    
    if (permission === "granted") {
      console.log("Permiso de notificación concedido.");
      
      const currentToken = await getToken(messaging, {
        serviceWorkerRegistration: registration,
      });

      if (currentToken) {
        console.log("Token FCM obtenido:", currentToken);
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
