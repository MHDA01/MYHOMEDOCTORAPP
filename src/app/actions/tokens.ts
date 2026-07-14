"use server";

import { getAdminDb } from "@/lib/firebase-admin";
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
 * Verificar si el usuario tiene tokens disponibles para una consulta.
 * 
 * @param uid - ID del usuario (tutor)
 * @returns { available: boolean, tokens: { free, paid }, needsPayment: boolean }
 */
export async function checkTokenAvailability(uid: string) {
  try {
    const tokensRef = db
      .collection("Cuentas_Tutor")
      .doc(uid)
      .collection("tokens")
      .doc("config");

    const tokenSnap = await tokensRef.get();

    // Si no tiene documento de tokens, crear uno (caso de usuario antiguo)
    if (!tokenSnap.exists) {
      console.warn(`[TOKENS] Usuario ${uid} no tiene documento de tokens. Creando...`);
      
      const now = new Date();
      const freePeriodEnds = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000); // +3 días

      const initialTokens: TokenSystem = {
        free: 6, // 2 consultas/día × 3 días
        paid: 0,
        dailyReset: now,
        freePeriodEnds,
      };

      await tokensRef.set(initialTokens);
      return {
        available: true,
        tokens: { free: 6, paid: 0 },
        needsPayment: false,
      };
    }

    const tokenData = tokenSnap.data() as TokenSystem;
    const totalTokens = (tokenData.free || 0) + (tokenData.paid || 0);
    const hasTokens = totalTokens > 0;

    // Verificar si el período de prueba expiró y no tiene tokens pagos
    const freePeriodEnds = toDate(tokenData.freePeriodEnds);
    const now = new Date();
    const trialExpired = now > freePeriodEnds;
    const needsPayment = trialExpired && (tokenData.paid || 0) === 0;

    return {
      available: hasTokens,
      tokens: {
        free: tokenData.free || 0,
        paid: tokenData.paid || 0,
      },
      needsPayment,
      freePeriodEnds,
    };

  } catch (error) {
    console.error("[TOKENS] Error en checkTokenAvailability:", error);
    throw error;
  }
}

/**
 * Obtener información completa de tokens del usuario.
 */
export async function getTokenInfo(uid: string) {
  try {
    const tokensRef = db
      .collection("Cuentas_Tutor")
      .doc(uid)
      .collection("tokens")
      .doc("config");

    const tokenSnap = await tokensRef.get();

    if (!tokenSnap.exists) {
      return {
        free: 0,
        paid: 0,
        dailyReset: new Date(),
        freePeriodEnds: new Date(),
      } as TokenSystem;
    }

    return tokenSnap.data() as TokenSystem;

  } catch (error) {
    console.error("[TOKENS] Error en getTokenInfo:", error);
    return {
      free: 0,
      paid: 0,
      dailyReset: new Date(),
      freePeriodEnds: new Date(),
    } as TokenSystem;
  }
}

/**
 * Obtener historial de transacciones de pago.
 */
export async function getTransactionHistory(uid: string) {
  try {
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
