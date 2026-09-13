// ============================================================
// app/actions/daily-tips-review.ts — Server Action: revisión por muestreo
// de los consejos de salud diarios generados automáticamente.
// Solo lectura, solo fundador. El envío ya ocurrió (job automático en
// Cloud Functions); esto es exclusivamente para control de calidad.
// ============================================================
'use server';

import { getAdminDb } from '@/lib/firebase-admin';
import { verifyAdminAccess } from '@/lib/admin-access';

export interface DailyTipSampleItem {
  id: string;
  uid: string;
  userName: string;
  content: string;
  isNewUser: boolean;
  pushSent: boolean;
  generatedAt: string;
}

function todayDocId(): string {
  const now = new Date();
  const bogota = new Date(now.toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const yyyy = bogota.getFullYear();
  const mm = String(bogota.getMonth() + 1).padStart(2, '0');
  const dd = String(bogota.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const SAMPLE_SIZE = 15;

export async function getDailyTipsSample(
  idToken: string,
  date?: string
): Promise<{ success: boolean; items?: DailyTipSampleItem[]; error?: string }> {
  const access = await verifyAdminAccess(idToken);
  if (!access.ok) {
    return { success: false, error: access.error };
  }

  try {
    const targetDate = date || todayDocId();
    const db = getAdminDb();

    const snap = await db
      .collectionGroup('dailyTips')
      .where('date', '==', targetDate)
      .limit(SAMPLE_SIZE)
      .get();

    const items: DailyTipSampleItem[] = await Promise.all(
      snap.docs.map(async (docSnap) => {
        const data = docSnap.data();
        const userRef = docSnap.ref.parent.parent;
        let userName = 'Usuario';

        if (userRef) {
          const userSnap = await userRef.get();
          const personalInfo = userSnap.data()?.personalInfo;
          if (personalInfo?.firstName) {
            userName = `${personalInfo.firstName} ${personalInfo.lastName || ''}`.trim();
          }
        }

        return {
          id: docSnap.id,
          uid: userRef?.id || 'desconocido',
          userName,
          content: data.content,
          isNewUser: !!data.isNewUser,
          pushSent: !!data.pushSent,
          generatedAt: data.generatedAt?.toDate?.().toISOString() ?? new Date().toISOString(),
        };
      })
    );

    return { success: true, items };
  } catch (error) {
    console.error('[DailyTipsReview] Error obteniendo muestra:', error);
    return { success: false, error: 'No se pudo cargar la muestra de consejos.' };
  }
}
