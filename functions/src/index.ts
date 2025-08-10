
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();
const fcm = admin.messaging();

/**
 * Scheduled function that runs every minute to check for due alarms.
 */
export const checkAlarms = functions
  .region("us-central1") // You can change this to your preferred region
  .pubsub.schedule("every 1 minutes")
  .onRun(async (context) => {
    console.log("Checking for due alarms...");

    const now = admin.firestore.Timestamp.now();

    // Query for alarms that are due.
    // We look for alarms with a timestamp less than or equal to the current time.
    const query = db.collection("alarms").where("alarmTime", "<=", now);
    const alarmsSnapshot = await query.get();

    if (alarmsSnapshot.empty) {
      console.log("No pending alarms found.");
      return null;
    }

    const promises: Promise<any>[] = [];

    for (const doc of alarmsSnapshot.docs) {
      const alarm = doc.data();
      
      if (alarm.fcmToken) {
          const payload = {
              notification: {
                  title: alarm.title || "¡Recordatorio!",
                  body: alarm.message || "Es la hora de tu recordatorio.",
                  icon: "https://i.postimg.cc/J7N5r89y/LOGO-1.png",
                  click_action: alarm.clickAction || '/',
              }
          };

          const sendPromise = fcm.sendToDevice(alarm.fcmToken, payload)
            .then(response => {
                console.log("Notification sent successfully:", response);
                // If the notification is for a recurring medication, reschedule it.
                if (alarm.isRecurring) {
                    const nextAlarmTime = new Date(alarm.alarmTime.toDate().getTime());
                    const intervalHours = alarm.frequency || 24;
                    nextAlarmTime.setHours(nextAlarmTime.getHours() + intervalHours);
                    
                    const reschedulePromise = doc.ref.update({
                        alarmTime: admin.firestore.Timestamp.fromDate(nextAlarmTime)
                    });
                    console.log(`Rescheduled recurring alarm for ${nextAlarmTime.toISOString()}`);
                    return reschedulePromise;
                } else {
                    // If it's a one-time alarm, delete it after sending.
                    return doc.ref.delete();
                }
            })
            .catch(error => {
                console.error("Error sending notification:", error);
                 // If the token is no longer valid, delete the alarm.
                 if (error.code === 'messaging/registration-token-not-registered') {
                    console.log("Invalid token. Deleting alarm.");
                    return doc.ref.delete();
                 }
                 return null;
            });

          promises.push(sendPromise);
      } else {
         // If there's no token, we can't send a notification. Delete the alarm.
         console.log(`Alarm ${doc.id} has no FCM token. Deleting.`);
         promises.push(doc.ref.delete());
      }
    }

    await Promise.all(promises);
    console.log(`Processed ${alarmsSnapshot.size} alarms.`);
    return null;
  });
