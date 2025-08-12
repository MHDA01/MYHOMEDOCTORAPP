/**
 * @fileoverview Archivo principal de Cloud Functions.
 * Contiene toda la lógica de las funciones programadas para notificaciones.
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

// Inicializa la app de Firebase Admin para poder acceder a los servicios.
try {
  admin.initializeApp();
} catch (e) {
  // Evitar doble inicialización en entornos de emulación/prueba.
  console.log("Firebase Admin ya ha sido inicializado.");
}

const db = admin.firestore();
const messaging = admin.messaging();

/**
 * Función programada para verificar y enviar recordatorios de citas.
 * Se ejecuta cada minuto para mayor precisión.
 */
export const checkAppointmentReminders = functions
  .region("us-central1")
  .pubsub.schedule("every 1 minutes")
  .onRun(async (context) => {
    console.log("Iniciando verificación de recordatorios de citas.");

    const now = new Date();
    // Se define un rango de 1 minuto para la notificación.
    const oneMinuteFromNow = new Date(now.getTime() + 60 * 1000);

    try {
      const usersSnapshot = await db.collection("users").get();
      const notificationPromises: Promise<any>[] = [];

      for (const userDoc of usersSnapshot.docs) {
        const userId = userDoc.id;
        const user = userDoc.data();
        const token = user?.notificationToken;

        if (!token) {
          continue; // Saltar usuario si no tiene token.
        }

        const appointmentsSnapshot = await db
          .collection("users")
          .doc(userId)
          .collection("appointments")
          .where("notified", "==", false) // Solo citas no notificadas.
          .get();

        for (const doc of appointmentsSnapshot.docs) {
          const cita = doc.data();

          if (!cita.date || !cita.reminder) {
            continue;
          }
          
          const reminderHoursMap: { [key: string]: number } = { '1h': 1, '2h': 2, '24h': 24, '2d': 48 };
          const reminderHours = reminderHoursMap[cita.reminder];

          if (!reminderHours) continue;

          const fechaCita = (cita.date as admin.firestore.Timestamp).toDate();
          const reminderTime = new Date(fechaCita.getTime() - reminderHours * 60 * 60 * 1000);
          
          // Comprobar si la hora del recordatorio está dentro del próximo minuto.
          if (reminderTime >= now && reminderTime < oneMinuteFromNow) {
            console.log(`Enviando recordatorio para cita ${doc.id} al usuario ${userId}.`);

            const message = {
              notification: {
                title: "Recordatorio de Cita Médica",
                body: `No olvides tu cita de ${cita.specialty || 'consulta'} a las ${fechaCita.toLocaleTimeString("es-CL", { hour: '2-digit', minute: '2-digit' })}.`,
              },
              token: token,
            };

            const promise = messaging.send(message).then(() => {
                // Marcar como notificado para no enviar de nuevo.
                return doc.ref.update({ notified: true });
              }).catch(error => {
                console.error(`Error enviando notificación de cita a ${userId}:`, error);
              });
            notificationPromises.push(promise);
          }
        }
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
 * Se ejecuta cada minuto para mayor precisión.
 */
export const checkMedicationReminders = functions
  .region("us-central1")
  .pubsub.schedule("every 1 minutes")
  .onRun(async (context) => {
    console.log("Iniciando verificación de recordatorios de medicamentos.");
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    try {
      const usersSnapshot = await db.collection("users").get();
      const notificationPromises: Promise<any>[] = [];

      for (const userDoc of usersSnapshot.docs) {
        const userId = userDoc.id;
        const token = userDoc.data()?.notificationToken;

        if (!token) {
          continue;
        }

        const medicationsSnapshot = await db
          .collection("users").doc(userId).collection("medications")
          .where("active", "==", true).get();

        for (const medDoc of medicationsSnapshot.docs) {
          const med = medDoc.data();

          if (!med.time || !Array.isArray(med.time)) {
            continue;
          }
          
          for (const timeStr of med.time) {
            const [hour, minute] = timeStr.split(':').map(Number);
            
            if (currentHour === hour && currentMinute === minute) {
              console.log(`Enviando recordatorio de medicamento ${med.name} al usuario ${userId}.`);

              const message = {
                notification: {
                  title: "Recordatorio de Medicamento",
                  body: `Es hora de tomar tu dosis de ${med.name} (${med.dosage}).`,
                },
                token: token,
              };

              const promise = messaging.send(message).catch(error => {
                console.error(`Error enviando notificación de medicamento a ${userId}:`, error);
              });
              notificationPromises.push(promise);
              break; // Salir del bucle de horarios para no enviar múltiples notificaciones por el mismo medicamento.
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

    