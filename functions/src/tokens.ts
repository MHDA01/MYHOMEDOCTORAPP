/**
 * @fileoverview Cloud Functions para gestión del sistema de tokens.
 *
 * Arquitectura:
 * - Token = 1 consulta completa de teleorientación
 * - Usuarios reciben 6 tokens gratis (2/día × 3 días)
 * - Renovación automática diaria (primeros 3 días)
 * - Después: pago por Wompy → 210 tokens (7 consultas/día × 30 días)
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

try {
  admin.initializeApp();
} catch (_) {
  // Ya inicializado
}

const db = admin.firestore();

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Renovación diaria de tokens gratis.
 * Se ejecuta cada día a las 00:00 UTC (ajustar si necesitas otro timezone).
 *
 * Lógica:
 * 1. Itera todos los usuarios que están en período de prueba (freePeriodEnds > ahora)
 * 2. Si ya renovó hoy (dailyReset es hoy), salta
 * 3. Si quedan días en período de prueba → suma 2 tokens
 * 4. Si freePeriodEnds pasó → no renova
 */
export const renewDailyFreeTokens = functions
  .region("us-central1")
  .pubsub.schedule("0 0 * * *") // 00:00 UTC
  .timeZone("UTC")
  .onRun(async (_context) => {
    console.log("[TOKENS] Iniciando renovación diaria de tokens gratis.");

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    try {
      // Obtener todos los usuarios
      const usersSnapshot = await db.collection("Cuentas_Tutor").get();

      const updatePromises: Promise<any>[] = [];

      for (const userDoc of usersSnapshot.docs) {
        const tokensRef = userDoc.ref.collection("tokens").doc("config");
        const tokenSnap = await tokensRef.get();

        if (!tokenSnap.exists) {
          console.warn(`[TOKENS] Usuario ${userDoc.id} no tiene documento de tokens`);
          continue;
        }

        const tokenData = tokenSnap.data() as any;
        const freePeriodEnds = new Date(tokenData.freePeriodEnds?.toDate?.() || tokenData.freePeriodEnds);
        const dailyReset = new Date(tokenData.dailyReset?.toDate?.() || tokenData.dailyReset);
        const dailyResetDate = new Date(dailyReset.getFullYear(), dailyReset.getMonth(), dailyReset.getDate());

        // Si ya renovó hoy, salta
        if (dailyResetDate.getTime() === today.getTime()) {
          continue;
        }

        // Si el período de prueba ya expiró, salta
        if (today > freePeriodEnds) {
          console.log(`[TOKENS] Período de prueba expirado para usuario ${userDoc.id}`);
          continue;
        }

        // Renovar: sumar 2 tokens y actualizar dailyReset
        const promise = tokensRef.update({
          free: admin.firestore.FieldValue.increment(2),
          dailyReset: now,
        })
          .then(() => {
            console.log(
              `[TOKENS] ✅ Renovación completada para ${userDoc.id}: +2 tokens`
            );
          })
          .catch(err => {
            console.error(`[TOKENS] Error renovando tokens para ${userDoc.id}:`, err);
          });

        updatePromises.push(promise);
      }

      await Promise.all(updatePromises);
      console.log("[TOKENS] Renovación diaria completada.");

    } catch (error) {
      console.error("[TOKENS] Error general en renewDailyFreeTokens:", error);
    }

    return null;
  });

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Decontar 1 token cuando se completa una consulta.
 *
 * Llamado desde la acción del cliente cuando:
 * - Usuario responde "Sí" a la pregunta de cierre del avatar
 * - Transición: conversación status → "completed"
 *
 * @param uid - ID del usuario
 * @param convId - ID de la conversación/consulta
 */
export async function decrementTokenOnConsultationComplete(
  uid: string,
  convId: string
): Promise<boolean> {
  try {
    // 1. Verificar que hay tokens disponibles
    const tokensRef = db.collection("Cuentas_Tutor").doc(uid).collection("tokens").doc("config");
    const tokenSnap = await tokensRef.get();

    if (!tokenSnap.exists) {
      throw new Error("Token document not found");
    }

    const tokenData = tokenSnap.data() as any;
    const availableTokens = (tokenData.free || 0) + (tokenData.paid || 0);

    if (availableTokens <= 0) {
      console.warn(`[TOKENS] Usuario ${uid} sin tokens disponibles`);
      return false;
    }

    // 2. Decidir qué token decontar: primero los pagos, luego los gratis
    const paidTokens = tokenData.paid || 0;
    const freeTokens = tokenData.free || 0;

    const tokenUpdate: any = {};

    if (paidTokens > 0) {
      tokenUpdate.paid = admin.firestore.FieldValue.increment(-1);
      console.log(`[TOKENS] Decontando token PAGADO para ${uid}`);
    } else {
      tokenUpdate.free = admin.firestore.FieldValue.increment(-1);
      console.log(`[TOKENS] Decontando token GRATIS para ${uid}`);
    }

    // 3. Actualizar tokens y marcar consulta como completada
    await Promise.all([
      tokensRef.update(tokenUpdate),
      db
        .collection("Cuentas_Tutor")
        .doc(uid)
        .collection("conversaciones")
        .doc(convId)
        .update({ status: "completed", tokenConsumed: true, completedAt: new Date() }),
    ]);

    console.log(`[TOKENS] ✅ Token decontado para consulta ${convId}`);
    return true;

  } catch (error) {
    console.error(`[TOKENS] Error decontando token:`, error);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cloud Function: Decontar token (endpoint HTTP).
 * Llamado desde el cliente cuando el usuario confirma cierre de consulta.
 *
 * Requiere autenticación Firebase.
 */
export const consumeTokenOnConsultationEnd = functions
  .region("us-central1")
  .https.onCall(async (data, context) => {
    // Validar autenticación
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Usuario no autenticado"
      );
    }

    const uid = context.auth.uid;
    const { convId } = data;

    if (!convId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "convId es requerido"
      );
    }

    try {
      const success = await decrementTokenOnConsultationComplete(uid, convId);

      return {
        success,
        message: success
          ? "Token decontado exitosamente"
          : "No hay tokens disponibles",
      };

    } catch (error: any) {
      console.error("[TOKENS] Error en consumeTokenOnConsultationEnd:", error);
      throw new functions.https.HttpsError(
        "internal",
        error.message || "Error decontando token"
      );
    }
  });
