
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as webpush from "web-push";

admin.initializeApp();
const db = admin.firestore();

// ¡IMPORTANTE!
// Debes generar tus propias claves VAPID. Puedes usar: npx web-push generate-vapid-keys
// La clave PÚBLICA se usa en el frontend (en UserContext).
// La clave PRIVADA se usa aquí.
// Guarda la clave privada de forma segura, por ejemplo, usando secrets de Firebase:
// firebase functions:secrets:set VAPID_PRIVATE_KEY
// Y luego accede a ella con: process.env.VAPID_PRIVATE_KEY
const vapidKeys = {
  publicKey: "YOUR_PUBLIC_VAPID_KEY", // Esta debe coincidir con la del frontend
  privateKey: functions.config().secrets.vapid_private_key || "YOUR_PRIVATE_VAPID_KEY_HERE" // ¡CAMBIAR POR SECRET!
};

webpush.setVapidDetails(
  "mailto:your-email@example.com", // Reemplaza con tu email
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// Cloud function que se ejecuta cada minuto
exports.checkAlarms = functions
  .region("us-central1")
  .pubsub.schedule("every 1 minutes")
  .onRun(async (context) => {
    console.log("Verificando alarmas...");

    const now = admin.firestore.Timestamp.now();

    const query = db.collection("alarms").where("alarmTime", "<=", now);
    const alarmsSnapshot = await query.get();

    if (alarmsSnapshot.empty) {
      console.log("No hay alarmas pendientes.");
      return null;
    }

    const promises: Promise<any>[] = [];

    for (const doc of alarmsSnapshot.docs) {
      const alarm = doc.data();
      
      const notificationPayload = JSON.stringify({
          title: alarm.title || "¡Alarma!",
          body: alarm.message || "Es la hora de tu recordatorio.",
          icon: "https://i.postimg.cc/J7N5r89y/LOGO-1.png",
          badge: "https://i.postimg.cc/J7N5r89y/LOGO-1.png",
          data: {
              url: alarm.clickAction || '/',
          },
      });

      // Obtener la suscripción del usuario
      const userDoc = await db.collection('users').doc(alarm.userId).get();
      const userData = userDoc.data();
      const subscription = userData?.pushSubscription;

      if (subscription) {
          const sendPromise = webpush.sendNotification(subscription, notificationPayload)
            .then(response => {
              console.log("Notificación enviada a:", subscription.endpoint, response.statusCode);
              return doc.ref.delete();
            })
            .catch(error => {
              console.error("Error al enviar notificación:", error);
              // Si la suscripción ha expirado o no es válida (código 410), la eliminamos.
              if (error.statusCode === 410 || error.statusCode === 404) {
                console.log("Suscripción no válida. Borrando del usuario.");
                // Borramos la suscripción del perfil del usuario y la alarma
                const updateUserPromise = userDoc.ref.update({ pushSubscription: admin.firestore.FieldValue.delete() });
                const deleteAlarmPromise = doc.ref.delete();
                return Promise.all([updateUserPromise, deleteAlarmPromise]);
              }
              return null;
            });
          promises.push(sendPromise);
      } else {
        // Si no hay suscripción, borramos la alarma para no reintentar
        console.log(`Usuario ${alarm.userId} no tiene suscripción. Borrando alarma.`);
        promises.push(doc.ref.delete());
      }
    }

    await Promise.all(promises);
    console.log(`Procesadas ${alarmsSnapshot.size} alarmas.`);
    return null;
  });
