"use server";

import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { getUserTokenState } from "@/lib/token-system";
import { TokenSystem } from "@/lib/types";

const db = getAdminDb();

/**
 * Convierte Timestamp de Firestore o Date a Date de JavaScript
 */
function toDate(value: any): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate(); // Firestore Timestamp
  return new Date(value);
}

/**
 * Las Server Actions son endpoints públicos: el uid se obtiene del token
 * verificado, nunca de un parámetro que mande el cliente.
 */
async function uidFromIdToken(idToken: string): Promise<string> {
  if (!idToken) throw new Error("No autenticado.");
  const decodedToken = await getAdminAuth().verifyIdToken(idToken);
  return decodedToken.uid;
}

/**
 * Verificar si el usuario tiene tokens disponibles para una consulta.
 * Delega en getUserTokenState (src/lib/token-system.ts), que es la única
 * fuente de verdad para el estado de tokens — evita que esta lógica se
 * duplique y se desincronice entre archivos.
 *
 * @param idToken - Firebase ID token del usuario (tutor)
 * @returns { available: boolean, tokens: { free, paid }, needsPayment: boolean }
 */
export async function checkTokenAvailability(idToken: string) {
  try {
    const uid = await uidFromIdToken(idToken);
    const state = await getUserTokenState(uid);
    return {
      available: state.available,
      tokens: state.tokens,
      needsPayment: state.needsPayment,
      freePeriodEnds: state.freePeriodEnds,
    };
  } catch (error) {
    console.error("[TOKENS] Error en checkTokenAvailability:", error);
    throw error;
  }
}

/**
 * Obtener información completa de tokens del usuario.
 */
export async function getTokenInfo(idToken: string): Promise<TokenSystem> {
  try {
    const uid = await uidFromIdToken(idToken);
    const state = await getUserTokenState(uid);
    return {
      free: state.tokens.free,
      paid: state.tokens.paid,
      dailyReset: state.dailyReset,
      freePeriodEnds: state.freePeriodEnds,
    };
  } catch (error) {
    console.error("[TOKENS] Error en getTokenInfo:", error);
    return {
      free: 0,
      paid: 0,
      dailyReset: new Date(),
      freePeriodEnds: new Date(),
    };
  }
}

/**
 * Obtener historial de transacciones de pago.
 */
export async function getTransactionHistory(idToken: string) {
  try {
    const uid = await uidFromIdToken(idToken);
    const transactionsRef = db
      .collection("Cuentas_Tutor")
      .doc(uid)
      .collection("transactions");

    const snapshot = await transactionsRef
      .orderBy("createdAt", "desc")
      .limit(10)
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: toDate(doc.data().createdAt),
      completedAt: toDate(doc.data().completedAt),
    }));

  } catch (error) {
    console.error("[TOKENS] Error en getTransactionHistory:", error);
    throw error;
  }
}
