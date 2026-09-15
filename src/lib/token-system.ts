import { getAdminDb } from '@/lib/firebase-admin';
import { COLECCION_TUTOR, DOC_TOKENS } from '@/lib/constants';
import { ACCESO_LIBRE } from '@/config/acceso';

const db = getAdminDb();

// Nota: functions/src/tokens.ts (Cloud Functions, deploy separado) tiene su
// propia constante FREE_TOKENS_PER_DAY para la renovación diaria — si cambias
// estos valores, ajusta también ese archivo para que coincidan.
const FREE_TOKENS_PER_DAY = parseInt(process.env.FREE_TOKENS_PER_DAY || '2', 10);
const FREE_TOKEN_PERIOD_DAYS = parseInt(process.env.FREE_TOKEN_PERIOD_DAYS || '3', 10);

function toDate(value: any): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  return new Date(value);
}

function getTokensRef(uid: string) {
  return db.collection(COLECCION_TUTOR).doc(uid).collection(DOC_TOKENS).doc('config');
}

async function ensureTokenDocument(uid: string) {
  const ref = getTokensRef(uid);
  const snap = await ref.get();

  if (snap.exists) {
    return snap.data() as any;
  }

  const now = new Date();
  const freePeriodEnds = new Date(now.getTime() + FREE_TOKEN_PERIOD_DAYS * 24 * 60 * 60 * 1000);
  const initialTokens = {
    free: FREE_TOKENS_PER_DAY * FREE_TOKEN_PERIOD_DAYS,
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
  const dailyReset = toDate(tokenData.dailyReset);
  const now = new Date();

  // Etapa gratuita (src/config/acceso.ts): todas las puertas preguntan aquí
  // (chat, contador, API de tokens), así que abrirla en este punto las abre todas.
  if (ACCESO_LIBRE) {
    return {
      available: true,
      tokens: { free, paid },
      needsPayment: false,
      freePeriodEnds,
      dailyReset,
      trialExpired: false,
      accesoLibre: true,
    };
  }

  const trialExpired = now > freePeriodEnds;
  const needsPayment = trialExpired && paid === 0;

  return {
    available: totalTokens > 0,
    tokens: { free, paid },
    needsPayment,
    freePeriodEnds,
    dailyReset,
    trialExpired,
    accesoLibre: false,
  };
}
