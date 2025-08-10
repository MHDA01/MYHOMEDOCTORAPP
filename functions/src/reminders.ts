
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
 * Se ejecuta cada hora (configurable).
 */
export const checkAppointmentReminders = functions
  .region("us-central1") // Define la región donde se ejecutará la función.
  .pubsub.schedule("every 60 minutes") // Se ejecuta cada 60 minutos.
  .onRun(async (context) => {
    console.log("Iniciando verificación de recordatorios de citas.");

    const now = new Date();
    // Clona la fecha actual y le suma una hora para definir el rango de búsqueda.
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

    // --- LÓGICA DE PRUEBA ---
    // Vamos a enviar una notificación de prueba a un usuario específico para verificar.
    // Reemplaza el UID de abajo con el tuyo para recibir la notificación.
    const TEST_USER_ID = "tRAKDG4GVEXebI6UCuQYMJDs3ZZ2"; 
    try {
        const userDoc = await db.collection("users").doc(TEST_USER_ID).get();
        const user = userDoc.data();
        const token = user?.notificationToken;

        if (token) {
            const testMessage = {
                notification: {
                    title: "Prueba de Notificación ✅",
                    body: "Si recibes esto, ¡la infraestructura de notificaciones está funcionando!",
                },
                token: token,
            };
            await messaging.send(testMessage);
            console.log(`Notificación de prueba enviada con éxito a ${TEST_USER_ID}`);
        } else {
            console.log(`Usuario de prueba ${TEST_USER_ID} no encontrado o sin token.`);
        }
    } catch (error) {
        console.error("Error al enviar la notificación de prueba:", error);
    }
    // --- FIN DE LÓGICA DE PRUEBA ---

    try {
      // Consulta todas las citas en la colección 'citas'.
      const appointmentsSnapshot = await db.collection("citas").get();

      // Array para mantener todas las promesas de envío de notificaciones.
      const notificationPromises: Promise<any>[] = [];

      for (const doc of appointmentsSnapshot.docs) {
        const cita = doc.data();

        // Valida que la cita tenga los campos necesarios.
        if (!cita.fechaHoraCita || !cita.recordatorioHorasAntes || !cita.usuarioId) {
          console.warn(`Cita ${doc.id} incompleta, saltando.`);
          continue;
        }

        // Convierte el Timestamp de Firestore a un objeto Date de JavaScript.
        const fechaCita = (cita.fechaHoraCita as admin.firestore.Timestamp).toDate();
        const reminderHours = Number(cita.recordatorioHorasAntes);

        // Calcula la hora exacta del recordatorio.
        const reminderTime = new Date(fechaCita.getTime() - reminderHours * 60 * 60 * 1000);

        // Comprueba si el recordatorio debe enviarse en la próxima hora y si no ha sido enviado ya.
        if (reminderTime >= now && reminderTime < oneHourFromNow && !cita.notified) {
          console.log(`Recordatorio para cita ${doc.id} programado para envío.`);

          // Obtiene el token de notificación del usuario.
          const userDoc = await db.collection("users").doc(cita.usuarioId).get();
          const user = userDoc.data();
          const token = user?.notificationToken;

          if (token) {
            // Define el contenido del mensaje push.
            const message = {
              notification: {
                title: "Recordatorio de Cita Médica",
                body: `No olvides tu cita para ${cita.specialty || 'tu consulta'} hoy a las ${fechaCita.toLocaleTimeString("es-CL", { hour: '2-digit', minute: '2-digit' })}.`,
              },
              token: token,
            };

            // Añade la promesa de envío al array.
            const promise = messaging.send(message)
              .then(response => {
                console.log("Notificación de cita enviada:", response);
                // Marca la cita como notificada para no volver a enviarla.
                return doc.ref.update({ notified: true });
              })
              .catch(error => {
                console.error("Error al enviar notificación de cita:", error);
              });
            notificationPromises.push(promise);
          } else {
            console.log(`Usuario ${cita.usuarioId} no tiene token de notificación.`);
          }
        }
      }

      // Espera a que todas las notificaciones se envíen.
      await Promise.all(notificationPromises);
      console.log("Verificación de recordatorios de citas completada.");

    } catch (error) {
      console.error("Error general en checkAppointmentReminders:", error);
    }

    return null; // Finaliza la ejecución de la función.
  });

/**
 * Función programada para verificar y enviar recordatorios de medicamentos.
 * Se ejecuta cada 5 minutos para mayor precisión.
 */
export const checkMedicationReminders = functions
  .region("us-central1")
  .pubsub.schedule("every 5 minutes")
  .onRun(async (context) => {
    console.log("Iniciando verificación de recordatorios de medicamentos.");
    const now = admin.firestore.Timestamp.now();
    const nowTime = now.toDate();

    try {
      // Obtiene todos los usuarios para iterar sobre sus medicamentos.
      const usersSnapshot = await db.collection("users").get();
      const notificationPromises: Promise<any>[] = [];

      for (const userDoc of usersSnapshot.docs) {
        const user = userDoc.data();
        const userId = userDoc.id;
        const token = user.notificationToken;

        if (!token) {
          continue; // Si el usuario no tiene token, pasa al siguiente.
        }

        // Obtiene la subcolección de medicamentos para el usuario actual.
        const medicationsSnapshot = await db.collection("users").doc(userId).collection("medications").where("active", "==", true).get();

        for (const medDoc of medicationsSnapshot.docs) {
          const med = medDoc.data();

          if (!med.time || !med.frequency) {
            continue;
          }
          
          // Itera sobre cada hora de recordatorio configurada para el medicamento.
          for (const timeStr of med.time) {
            const [hour, minute] = timeStr.split(':').map(Number);
            
            // Compara la hora actual con la hora del recordatorio.
            // Se comprueba si la hora y los minutos coinciden con el intervalo de 5 minutos actual.
            if (nowTime.getHours() === hour && nowTime.getMinutes() >= minute && nowTime.getMinutes() < minute + 5) {
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

                // Rompemos el bucle de horarios para no enviar múltiples notificaciones para el mismo medicamento en la misma ejecución.
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

    