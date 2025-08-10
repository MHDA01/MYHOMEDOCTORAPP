
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

const db = admin.firestore();

// Esta función se ejecutará cada minuto gracias a Cloud Scheduler.
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
    alarmsSnapshot.forEach((doc) => {
      const alarm = doc.data();
      
      const message = {
        notification: {
          title: alarm.title || "¡Alarma!",
          body: alarm.message || "Es la hora de tu recordatorio.",
          icon: "https://i.postimg.cc/J7N5r89y/LOGO-1.png",
        },
        token: alarm.fcmToken,
        webpush: {
            fcmOptions: {
                link: alarm.clickAction || '/'
            },
            notification: {
                badge: "https://i.postimg.cc/J7N5r89y/LOGO-1.png",
            }
        }
      };

      const sendPromise = admin.messaging().send(message)
        .then(response => {
          console.log("Notificación enviada a:", alarm.fcmToken, response);
          return doc.ref.delete();
        })
        .catch(error => {
          console.error("Error al enviar notificación:", error);
          // Si el token no es válido, borramos la alarma para no reintentar
          if (error.code === 'messaging/registration-token-not-registered') {
            console.log(`Token inválido ${alarm.fcmToken}. Borrando alarma.`);
            return doc.ref.delete();
          }
          return null;
        });
        
      promises.push(sendPromise);
    });

    await Promise.all(promises);
    console.log(`Procesadas ${alarmsSnapshot.size} alarmas.`);
    return null;
  });
