
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

export async function scheduleAlarm(params: {
  userId: string;
  title: string;
  body: string;
  localISO: string; // fecha/hora local del usuario en ISO
  tz?: string;
  clickAction?: string;
  fcmToken: string;
  recurring?: {
    frequency: number; // in hours
  };
  medicationId?: string;
}) {
  const scheduled = new Date(params.localISO);
  // Convertimos a UTC ISO (Date almacena internamente UTC)
  const scheduledAt = scheduled.toISOString();

  const alarmData: any = {
    userId: params.userId,
    title: params.title,
    body: params.body,
    scheduledAt,
    tz: params.tz || Intl.DateTimeFormat().resolvedOptions().timeZone,
    clickAction: params.clickAction || '/',
    fcmToken: params.fcmToken,
    sent: false,
    createdAt: serverTimestamp()
  };

  if (params.recurring) {
    alarmData.recurring = params.recurring;
  }
  if (params.medicationId) {
    alarmData.medicationId = params.medicationId;
  }

  await addDoc(collection(db, 'alarms'), alarmData);
}
