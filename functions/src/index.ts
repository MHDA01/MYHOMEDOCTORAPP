import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

// Esta función se ejecutará cada minuto para buscar alarmas pendientes.
export const checkAlarms = functions.pubsub.schedule("every 1 minutes").onRun(async (context) => {
    functions.logger.info("Ejecutando revisión de alarmas...");

    const now = admin.firestore.Timestamp.now();

    // Buscar en la colección 'alarms' documentos cuya hora ya pasó y no han sido enviados.
    const query = db.collectionGroup("alarms")
        .where("alarmTime", "<=", now)
        .where("status", "==", "scheduled");

    const dueAlarms = await query.get();

    if (dueAlarms.empty) {
        functions.logger.info("No hay alarmas pendientes.");
        return null;
    }

    const promises: Promise<any>[] = [];

    dueAlarms.forEach((doc) => {
        const alarm = doc.data();
        functions.logger.info(`Procesando alarma para el token: ${alarm.fcmToken}`);

        // Construir el payload de la notificación
        const payload = {
            notification: {
                title: alarm.title || "¡Recordatorio!",
                body: alarm.message || "Es la hora que programaste.",
            },
            token: alarm.fcmToken,
        };

        // Enviar la notificación
        const sendPromise = admin.messaging().send(payload)
            .then((response) => {
                functions.logger.info("Notificación enviada exitosamente:", response, "for token", alarm.fcmToken);
                // Actualizar el estado de la alarma a 'sent' para no volver a enviarla.
                return doc.ref.update({status: "sent"});
            })
            .catch((error) => {
                functions.logger.error("Error al enviar notificación:", error);
                // Si el token no es válido, podríamos marcarlo para eliminarlo.
                if (error.code === "messaging/registration-token-not-registered") {
                    return doc.ref.update({status: "invalid-token"});
                }
                return doc.ref.update({status: "error"});
            });

        promises.push(sendPromise);
    });

    return Promise.all(promises);
});
