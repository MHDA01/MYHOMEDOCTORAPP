
/**
 * @fileoverview Lógica para los recordatorios de citas y medicamentos.
 * Contiene las Cloud Functions programadas que se encargan de enviar
 * notificaciones push a los usuarios.
 *
 * Estructura Firestore canónica:
 *   Cuentas_Tutor/{uid}/appointments/{id}   ← citas del Titular
 *   Cuentas_Tutor/{uid}/medications/{id}    ← medicamentos del Titular
 *   Cuentas_Tutor/{uid}.notificationToken   ← FCM token del dispositivo
 */

import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";

try {
  admin.initializeApp();
} catch (e) {
  // Ya inicializado en otro módulo
}

const db        = admin.firestore();
const messaging = admin.messaging();

/**
 * Las funciones corren en UTC, pero la fecha de la cita y las horas de los
 * medicamentos las escribe el usuario en hora de Colombia.
 */
const ZONA_HORARIA = "America/Bogota";

function horaEnBogota(fecha: Date): { hora: number; minuto: number } {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONA_HORARIA,
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(fecha);
  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value);
  return { hora: valor("hour"), minuto: valor("minute") };
}

/** "el lunes, 15 de septiembre a las 3:00 p. m." (con "a la" para la 1). */
function cuandoEsLaCita(fecha: Date): string {
  const dia  = fecha.toLocaleDateString("es-CO", { timeZone: ZONA_HORARIA, weekday: "long", day: "numeric", month: "long" });
  const hora = fecha.toLocaleTimeString("es-CO", { timeZone: ZONA_HORARIA, hour: "numeric", minute: "2-digit" });
  return `el ${dia} ${hora.startsWith("1:") ? "a la" : "a las"} ${hora}`;
}

/**
 * Función programada para verificar y enviar recordatorios de citas.
 * Se ejecuta cada 5 minutos.
 *
 * Lee appointments de todas las cuentas usando collectionGroup para
 * evitar N+1 consultas de usuarios.
 */
export const checkAppointmentReminders = functions
  .region("us-central1")
  .pubsub.schedule("every 5 minutes")
  .onRun(async (_context) => {
    console.log("Iniciando verificación de recordatorios de citas.");

    const now            = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

    try {
      // Consulta todas las citas pendientes con recordatorio no enviado
      // collectionGroup abarca Cuentas_Tutor/{uid}/appointments sin iterar usuarios
      const snapshot = await db
        .collectionGroup("appointments")
        .where("notified", "==", false)
        .where("status",   "==", "Upcoming")
        .get();

      const notificationPromises: Promise<any>[] = [];

      for (const docSnap of snapshot.docs) {
        const cita = docSnap.data();

        if (!cita.date || !cita.reminder) continue;

        const fechaCita    = (cita.date as admin.firestore.Timestamp).toDate();

        // Mapear clave de reminder a horas (ej: '1h' → 1, '2d' → 48)
        const reminderMap: Record<string, number> = { '1h': 1, '2h': 2, '24h': 24, '2d': 48 };
        const reminderHours = reminderMap[cita.reminder];

        // "none" es "Sin recordatorio" en el formulario; antes caía en 24 h y avisaba igual.
        if (!reminderHours) continue;

        const reminderTime = new Date(fechaCita.getTime() - reminderHours * 60 * 60 * 1000);

        if (reminderTime < now || reminderTime >= oneHourFromNow) continue;

        // El uid es el ancestro en el path: Cuentas_Tutor/{uid}/appointments/{id}
        const uid     = docSnap.ref.parent.parent?.id;
        if (!uid) continue;

        const userSnap = await db.collection("Cuentas_Tutor").doc(uid).get();
        const token    = userSnap.data()?.notificationToken as string | undefined;

        if (!token) continue;

        const promise = messaging.send({
          notification: {
            title: "Recordatorio de Cita Médica",
            body:  `No olvides tu cita con ${cita.doctor || 'el médico'} (${cita.specialty || ''}) ${cuandoEsLaCita(fechaCita)}.`,
          },
          token,
        })
          .then(() => docSnap.ref.update({ notified: true }))
          .catch(err => console.error(`Error al enviar recordatorio de cita ${docSnap.id}:`, err));

        notificationPromises.push(promise);
      }

      await Promise.all(notificationPromises);
      console.log("Verificación de recordatorios de citas completada.");

    } catch (error) {
      console.error("Error general en checkAppointmentReminders:", error);
    }

    return null;
  });

/**
 * Función programada para verificar y enviar recordatorios de medicamentos.
 * Se ejecuta cada 5 minutos.
 */
export const checkMedicationReminders = functions
  .region("us-central1")
  .pubsub.schedule("every 5 minutes")
  .onRun(async (_context) => {
    console.log("Iniciando verificación de recordatorios de medicamentos.");

    const ahora = horaEnBogota(new Date());

    try {
      const usersSnapshot = await db.collection("Cuentas_Tutor").get();
      const notificationPromises: Promise<any>[] = [];

      for (const userDoc of usersSnapshot.docs) {
        const token = userDoc.data().notificationToken as string | undefined;
        if (!token) continue;

        const medicationsSnapshot = await db
          .collection("Cuentas_Tutor")
          .doc(userDoc.id)
          .collection("medications")
          .where("active", "==", true)
          .get();

        for (const medDoc of medicationsSnapshot.docs) {
          const med = medDoc.data();
          if (!med.time || !med.frequency) continue;

          for (const timeStr of med.time as string[]) {
            const [hour, minute] = timeStr.split(":").map(Number);

            // Enviar si la hora actual de Colombia coincide con el slot (ventana de 5 min)
            if (
              ahora.hora   === hour &&
              ahora.minuto >= minute &&
              ahora.minuto <  minute + 5
            ) {
              const promise = messaging.send({
                notification: {
                  title: "Recordatorio de Medicamento",
                  body:  `Es hora de tomar tu dosis de ${med.name} (${med.dosage}).`,
                },
                token,
              })
                .then(() => console.log(`Recordatorio de ${med.name} enviado a ${userDoc.id}`))
                .catch(err => console.error(`Error al enviar recordatorio de medicamento ${medDoc.id}:`, err));

              notificationPromises.push(promise);
              break; // una notificación por medicamento por ejecución
            }
          }
        }
      }

      await Promise.all(notificationPromises);
      console.log("Verificación de recordatorios de medicamentos completada.");

    } catch (error) {
      console.error("Error general en checkMedicationReminders:", error);
    }

    return null;
  });
