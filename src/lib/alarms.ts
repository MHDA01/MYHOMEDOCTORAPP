
import { collection, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from './firebase';

export async function scheduleAlarm(params: {
  fcmToken: string;
  message: string;
  localTime: string; // HH:mm format
  title: string;
  clickAction: string;
  userId: string;
  medicationId: string;
}) {
    // Build the alarm date
    const [hours, minutes] = params.localTime.split(':').map(Number);
    const alarmDate = new Date();
    alarmDate.setHours(hours, minutes, 0, 0);

    // If the time has already passed today, schedule it for tomorrow
    if (alarmDate < new Date()) {
        alarmDate.setDate(alarmDate.getDate() + 1);
    }

    // Save the alarm in Firestore
    await addDoc(collection(db, "alarms"), {
        fcmToken: params.fcmToken,
        title: params.title,
        message: params.message,
        alarmTime: Timestamp.fromDate(alarmDate),
        clickAction: params.clickAction,
        userId: params.userId,
        medicationId: params.medicationId,
        createdAt: serverTimestamp()
    });
}
