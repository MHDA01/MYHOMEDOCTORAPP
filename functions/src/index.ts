
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { DateTime } from 'luxon';

admin.initializeApp();
const db = admin.firestore();
const fcm = admin.messaging();

const rescheduleRecurring = async (alarm: any) => {
    if (alarm.recurring && alarm.recurring.frequency) {
        const currentScheduledAt = DateTime.fromISO(alarm.scheduledAt);
        const nextScheduledAt = currentScheduledAt.plus({ hours: alarm.recurring.frequency });
        
        const nextAlarm = {
            ...alarm,
            scheduledAt: nextScheduledAt.toISO(),
            sent: false,
            // Reset sentAt field for the new alarm
            sentAt: null 
        };

        // Create a new alarm document for the next occurrence
        await db.collection('alarms').add(nextAlarm);
    }
}

// Corre cada minuto. Ajusta la zona para logging; el cálculo usa UTC.
export const tickAlarms = functions.pubsub.schedule('* * * * *')
  .timeZone('UTC')
  .onRun(async () => {
    const now = DateTime.utc();
    // We create a 60-second window to catch alarms that are due.
    // This accounts for any minor delays in function execution.
    const windowStart = now.minus({ seconds: 30 });
    const windowEnd = now.plus({ seconds: 30 });

    functions.logger.info(`Checking for alarms between ${windowStart.toISO()} and ${windowEnd.toISO()}`);

    // Buscar alarmas no enviadas dentro de la ventana de 60s
    const snap = await db.collection('alarms')
      .where('sent', '==', false)
      .where('scheduledAt', '>=', windowStart.toISO())
      .where('scheduledAt', '<=', windowEnd.toISO())
      .get();

    if (snap.empty) {
        functions.logger.info("No alarms to process in this window.");
        return null;
    }
    
    functions.logger.info(`Found ${snap.docs.length} alarms to process.`);

    const batch = db.batch();
    const tasks: Promise<any>[] = [];

    snap.docs.forEach(docRef => {
      const alarm = docRef.data() as any;
      const token = alarm.fcmToken;
      if (!token) {
          functions.logger.warn(`Alarm ${docRef.id} is missing an FCM token.`);
          return; // Skip if no token
      }

      const message: admin.messaging.Message = {
        token,
        notification: {
          title: alarm.title || 'Recordatorio',
          body: alarm.body || ''
        },
        webpush: {
          fcmOptions: { link: alarm.clickAction || '/' },
          headers: {
            // Time to live for the notification in seconds.
            TTL: '300' 
          }
        }
      };

      tasks.push(fcm.send(message).then(response => {
         functions.logger.info(`Successfully sent message for alarm ${docRef.id}:`, response);
         if (alarm.recurring) {
            return rescheduleRecurring(alarm);
         }
         return null;
      }).catch(error => {
          functions.logger.error(`Error sending message for alarm ${docRef.id}:`, error);
      }));

      // Mark the current alarm as sent so it's not processed again.
      batch.update(docRef.ref, { sent: true, sentAt: admin.firestore.FieldValue.serverTimestamp() });
    });

    await Promise.allSettled(tasks);
    await batch.commit();
    functions.logger.info("Batch commit successful.");
    return null;
  });
