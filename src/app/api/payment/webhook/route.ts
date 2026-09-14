import { createHash } from 'crypto';
import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

export const dynamic = 'force-dynamic';

/**
 * Verifica el checksum que Wompi firma en cada evento, con WOMPY_EVENTS_SECRET
 * (misma verificación que wompyWebhook en functions/src/wompy.ts). Sin esto
 * cualquiera podría mandar un uid en `reference` y acreditarse tokens pagados.
 * Sin el secreto configurado, rechaza todo.
 */
function verifyWompiSignature(event: any): boolean {
  const secret = process.env.WOMPY_EVENTS_SECRET;
  if (!secret) return false;

  const properties: string[] = event?.signature?.properties;
  const checksum: string = event?.signature?.checksum;
  const timestamp = event?.timestamp;

  if (!Array.isArray(properties) || !properties.length || !checksum || !timestamp) {
    return false;
  }

  const values = properties.map((path) =>
    path.split('.').reduce((obj: any, key: string) => obj?.[key], event.data)
  );

  const computed = createHash('sha256').update(values.join('') + timestamp + secret).digest('hex');
  return computed.toLowerCase() === String(checksum).toLowerCase();
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));

    if (!verifyWompiSignature(body)) {
      console.error('[WOMPY WEBHOOK] Firma inválida, evento rechazado');
      return NextResponse.json({ error: 'Firma inválida' }, { status: 401 });
    }

    const event = body?.event || body;

    const wompyId = event?.data?.id || event?.id;
    const status = event?.data?.status || event?.status;
    const reference = event?.data?.reference || event?.reference;
    const paidTokens = Number(process.env.PAID_TOKENS_PER_MONTH || 210);

    if (!wompyId || !reference) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
    }

    const uid = reference.split('_').pop();
    if (!uid) {
      return NextResponse.json({ error: 'Reference inválido' }, { status: 400 });
    }

    const db = getAdminDb();
    const txRef = db.collection('Cuentas_Tutor').doc(uid).collection('transactions').where('wompy_id', '==', wompyId).limit(1);
    const txSnap = await txRef.get();

    if (txSnap.empty) {
      return NextResponse.json({ error: 'Transacción no encontrada' }, { status: 404 });
    }

    const docRef = txSnap.docs[0].ref;
    const isSuccess = status === 'COMPLETED' || status === 'success' || event?.type === 'transaction.completed';
    const newStatus = isSuccess ? 'success' : 'failed';

    await docRef.update({
      status: newStatus,
      completedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    if (isSuccess) {
      const tokensRef = db.collection('Cuentas_Tutor').doc(uid).collection('tokens').doc('config');
      const tokenDoc = await tokensRef.get();
      const currentPaid = tokenDoc.exists ? tokenDoc.data()?.paid || 0 : 0;

      await tokensRef.set({
        paid: currentPaid + paidTokens,
        planExpires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      }, { merge: true });
    }

    return NextResponse.json({ received: true, status: newStatus });
  } catch (error: any) {
    console.error('[WOMPY WEBHOOK]', error);
    return NextResponse.json({ error: error.message || 'Error procesando webhook' }, { status: 500 });
  }
}
