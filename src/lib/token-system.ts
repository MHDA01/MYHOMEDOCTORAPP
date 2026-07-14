import { getAdminDb } from '@/lib/firebase-admin';
import { COLECCION_TUTOR, DOC_TOKENS, SUBCOLECCION_TRANSACTIONS } from '@/lib/constants';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

const db = getAdminDb();

function toDate(value: any): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  return new Date(value);
}

function getTokensRef(uid: string) {
  return db.collection(COLECCION_TUTOR).doc(uid).collection(DOC_TOKENS).doc('config');
}

function getTransactionsRef(uid: string) {
  return db.collection(COLECCION_TUTOR).doc(uid).collection(SUBCOLECCION_TRANSACTIONS);
}

async function ensureTokenDocument(uid: string) {
  const ref = getTokensRef(uid);
  const snap = await ref.get();

  if (snap.exists) {
    return snap.data() as any;
  }

  const now = new Date();
  const freePeriodEnds = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const initialTokens = {
    free: 6,
    paid: 0,
    dailyReset: now,
    freePeriodEnds,
  };

  await ref.set(initialTokens);
  return initialTokens;
}

export async function getUserTokenState(uid: string) {
  const tokenData = await ensureTokenDocument(uid);
  const free = tokenData.free || 0;
  const paid = tokenData.paid || 0;
  const totalTokens = free + paid;
  const freePeriodEnds = toDate(tokenData.freePeriodEnds);
  const now = new Date();
  const trialExpired = now > freePeriodEnds;
  const needsPayment = trialExpired && paid === 0;

  return {
    available: totalTokens > 0,
    tokens: { free, paid },
    needsPayment,
    freePeriodEnds,
    trialExpired,
  };
}

export async function decrementTokenForConsultation(uid: string, details?: { description?: string }) {
  const ref = getTokensRef(uid);
  const transactionRef = getTransactionsRef(uid).doc();

  const result = await db.runTransaction(async (transaction) => {
    const tokenSnap = await transaction.get(ref);
    if (!tokenSnap.exists) {
      await ensureTokenDocument(uid);
      return false;
    }

    const tokenData = tokenSnap.data() as any;
    const free = tokenData.free || 0;
    const paid = tokenData.paid || 0;
    const totalTokens = free + paid;

    if (totalTokens <= 0) {
      return false;
    }

    const update: Record<string, any> = {};
    if (paid > 0) {
      update.paid = FieldValue.increment(-1);
    } else if (free > 0) {
      update.free = FieldValue.increment(-1);
    } else {
      return false;
    }

    transaction.update(ref, update);
    transaction.set(transactionRef, {
      userId: uid,
      type: 'consumption',
      tokens: -1,
      status: 'completed',
      description: details?.description || 'Consumo de token por consulta',
      createdAt: Timestamp.now(),
    }, { merge: true });

    return true;
  });

  return result;
}

export async function logPaymentTransaction(uid: string, payload: Record<string, any>) {
  const ref = getTransactionsRef(uid).doc();
  await ref.set({
    userId: uid,
    type: 'payment',
    createdAt: Timestamp.now(),
    ...payload,
  });
}
