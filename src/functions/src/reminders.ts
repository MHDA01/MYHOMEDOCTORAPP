/**
 * @fileoverview Lógica para los recordatorios de citas y medicamentos.
 * Contiene las Cloud Functions programadas que se encargan de enviar
 * notificaciones push a los usuarios.
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

// Inicializa la app de Firebase Admin para poder acceder a los servicios.
try {
  admin.initializeApp();
} catch (e) {
  console.log("Admin ya inicializado.");
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
    // Clona la fecha actual y le suma una hora para definir el rango de búsqueda.
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

    try {
      // 1. Obtener todos los usuarios
      const usersSnapshot = await db.collection("users").get();
      const notificationPromises: Promise<any>[] = [];

      for (const userDoc of usersSnapshot.docs) {
        const userId = userDoc.id;
        const user = userDoc.data();
        const token = user?.notificationToken;

        if (!token) {
          console.log(`Usuario ${userId} no tiene token, saltando.`);
          continue;
        }

        // 2. Para cada usuario, consultar su subcolección de citas
        const appointmentsSnapshot = await db.collection("users").doc(userId).collection("appointments").get();

        for (const doc of appointmentsSnapshot.docs) {
          const cita = doc.data();

          if (!cita.date || !cita.reminder || cita.notified) {
            continue;
          }
          
          const reminderHoursMap: { [key: string]: number } = { '1h': 1, '2h': 2, '24h': 24, '2d': 48 };
          const reminderHours = reminderHoursMap[cita.reminder];

          if (!reminderHours) continue;

          const fechaCita = (cita.date as admin.firestore.Timestamp).toDate();
          const reminderTime = new Date(fechaCita.getTime() - reminderHours * 60 * 60 * 1000);

          // Comprueba si el recordatorio debe enviarse en la próxima hora y si no ha sido enviado ya.
          if (reminderTime >= now && reminderTime < oneHourFromNow) {
            console.log(`Recordatorio para cita ${doc.id} del usuario ${userId} programado para envío.`);

            const message = {
              notification: {
                title: "Recordatorio de Cita Médica",
                body: `No olvides tu cita para ${cita.specialty || 'tu consulta'} hoy a las ${fechaCita.toLocaleTimeString("es-CL", { hour: '2-digit', minute: '2-digit' })}.`,
              },
              token: token,
            };

            const promise = messaging.send(message)
              .then(response => {
                console.log("Notificación de cita enviada:", response);
                return doc.ref.update({ notified: true });
              })
              .catch(error => {
                console.error("Error al enviar notificación de cita:", error);
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
        const user = userDoc.data();
        const userId = userDoc.id;
        const token = user.notificationToken;

        if (!token) {
          continue;
        }

        const medicationsSnapshot = await db.collection("users").doc(userId).collection("medications").where("active", "==", true).get();

        for (const medDoc of medicationsSnapshot.docs) {
          const med = medDoc.data();

          if (!med.time || !med.frequency) {
            continue;
          }
          
          for (const timeStr of med.time) {
            const [hour, minute] = timeStr.split(':').map(Number);
            
            if (currentHour === hour && currentMinute === minute) {
                console.log(`Recordatorio de medicamento ${med.name} para usuario ${userId} coincide con la hora actual.`);

                const message = {
                    notification: {
                        title: "Recordatorio de Medicamento",
                        body: `Es hora de tomar tu dosis de ${med.name} (${med.dosage}).`,
                    },
                    token: token,
                };

                const promise = messaging.send(message)
                    .then(response => {
                        console.log(`Notificación de medicamento para ${med.name} enviada a ${userId}:`, response);
                    })
                    .catch(error => {
                        console.error(`Error al enviar notificación de medicamento para ${userId}:`, error);
                    });
                notificationPromises.push(promise);
                break;
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
