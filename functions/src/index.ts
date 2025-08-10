
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();
const fcm = admin.messaging();

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
      
      const userDoc = await db.collection('users').doc(alarm.userId).get();
      const userToken = userDoc.data()?.fcmToken;

      if (userToken) {
          const payload = {
              notification: {
                  title: alarm.title || "¡Alarma!",
                  body: alarm.message || "Es la hora de tu recordatorio.",
                  icon: "https://i.postimg.cc/J7N5r89y/LOGO-1.png",
                  click_action: alarm.clickAction || '/',
              }
          };

          const sendPromise = fcm.sendToDevice(userToken, payload)
            .then(response => {
                console.log("Notificación enviada con éxito:", response);
                // Si la enviamos, borramos la alarma para no volver a enviarla.
                return doc.ref.delete();
            })
            .catch(error => {
                console.error("Error al enviar notificación:", error);
                // Si el token no es válido, lo borramos del perfil de usuario.
                 if (error.code === 'messaging/registration-token-not-registered') {
                    console.log("Token no válido. Borrando del usuario.");
                    return userDoc.ref.update({ fcmToken: admin.firestore.FieldValue.delete() });
                 }
                 return null;
            });

          promises.push(sendPromise);
      } else {
         // Si no hay token, borramos la alarma para no reintentar
         console.log(`Usuario ${alarm.userId} no tiene token FCM. Borrando alarma.`);
         promises.push(doc.ref.delete());
      }
    }

    await Promise.all(promises);
    console.log(`Procesadas ${alarmsSnapshot.size} alarmas.`);
    return null;
  });
