"use strict";
/**
 * @fileoverview Cloud Functions para gestión del sistema de tokens.
 *
 * Arquitectura:
 * - Token = 1 consulta completa de teleorientación
 * - Usuarios reciben 6 tokens gratis (2/día × 3 días)
 * - Renovación automática diaria (primeros 3 días)
 * - Después: pago por Wompy → 210 tokens (7 consultas/día × 30 días)
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.consumeTokenOnConsultationEnd = exports.renewDailyFreeTokens = void 0;
exports.decrementTokenOnConsultationComplete = decrementTokenOnConsultationComplete;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
try {
    admin.initializeApp();
}
catch (_) {
    // Ya inicializado
}
const db = admin.firestore();
// Debe coincidir con FREE_TOKENS_PER_DAY en src/lib/token-system.ts (Next.js,
// deploy separado) — ese archivo controla el otorgamiento inicial de tokens
// gratis; esta constante controla su renovación diaria.
const FREE_TOKENS_PER_DAY = 2;
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
exports.renewDailyFreeTokens = functions
    .region("us-central1")
    .pubsub.schedule("0 0 * * *") // 00:00 UTC
    .timeZone("UTC")
    .onRun(async (_context) => {
    var _a, _b, _c, _d;
    console.log("[TOKENS] Iniciando renovación diaria de tokens gratis.");
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    try {
        // Obtener todos los usuarios
        const usersSnapshot = await db.collection("Cuentas_Tutor").get();
        const updatePromises = [];
        for (const userDoc of usersSnapshot.docs) {
            const tokensRef = userDoc.ref.collection("tokens").doc("config");
            const tokenSnap = await tokensRef.get();
            if (!tokenSnap.exists) {
                console.warn(`[TOKENS] Usuario ${userDoc.id} no tiene documento de tokens`);
                continue;
            }
            const tokenData = tokenSnap.data();
            const freePeriodEnds = new Date(((_b = (_a = tokenData.freePeriodEnds) === null || _a === void 0 ? void 0 : _a.toDate) === null || _b === void 0 ? void 0 : _b.call(_a)) || tokenData.freePeriodEnds);
            const dailyReset = new Date(((_d = (_c = tokenData.dailyReset) === null || _c === void 0 ? void 0 : _c.toDate) === null || _d === void 0 ? void 0 : _d.call(_c)) || tokenData.dailyReset);
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
            // Renovar: sumar los tokens gratis diarios y actualizar dailyReset
            const promise = tokensRef.update({
                free: admin.firestore.FieldValue.increment(FREE_TOKENS_PER_DAY),
                dailyReset: now,
            })
                .then(() => {
                console.log(`[TOKENS] ✅ Renovación completada para ${userDoc.id}: +${FREE_TOKENS_PER_DAY} tokens`);
            })
                .catch(err => {
                console.error(`[TOKENS] Error renovando tokens para ${userDoc.id}:`, err);
            });
            updatePromises.push(promise);
        }
        await Promise.all(updatePromises);
        console.log("[TOKENS] Renovación diaria completada.");
    }
    catch (error) {
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
async function decrementTokenOnConsultationComplete(uid, convId) {
    const tokensRef = db.collection("Cuentas_Tutor").doc(uid).collection("tokens").doc("config");
    const convRef = db.collection("Cuentas_Tutor").doc(uid).collection("conversaciones").doc(convId);
    try {
        // Transacción: lectura y escritura del saldo deben resolverse de forma atómica.
        // Sin esto, dos llamadas casi simultáneas (dos pestañas, doble clic, reintento
        // de red) podrían leer el mismo saldo antes de que cualquiera escriba, y
        // ambas restar — dejando el saldo en negativo.
        const result = await db.runTransaction(async (transaction) => {
            const tokenSnap = await transaction.get(tokensRef);
            if (!tokenSnap.exists) {
                throw new Error("Token document not found");
            }
            const tokenData = tokenSnap.data();
            const paidTokens = tokenData.paid || 0;
            const freeTokens = tokenData.free || 0;
            const availableTokens = freeTokens + paidTokens;
            if (availableTokens <= 0) {
                console.warn(`[TOKENS] Usuario ${uid} sin tokens disponibles`);
                return false;
            }
            // Decidir qué token decontar: primero los pagos, luego los gratis
            const tokenUpdate = {};
            if (paidTokens > 0) {
                tokenUpdate.paid = admin.firestore.FieldValue.increment(-1);
                console.log(`[TOKENS] Decontando token PAGADO para ${uid}`);
            }
            else {
                tokenUpdate.free = admin.firestore.FieldValue.increment(-1);
                console.log(`[TOKENS] Decontando token GRATIS para ${uid}`);
            }
            transaction.update(tokensRef, tokenUpdate);
            transaction.update(convRef, { status: "completed", tokenConsumed: true, completedAt: new Date() });
            return true;
        });
        if (result) {
            console.log(`[TOKENS] ✅ Token decontado para consulta ${convId}`);
        }
        return result;
    }
    catch (error) {
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
exports.consumeTokenOnConsultationEnd = functions
    .region("us-central1")
    .https.onCall(async (data, context) => {
    // Validar autenticación
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
    }
    const uid = context.auth.uid;
    const { convId } = data;
    if (!convId) {
        throw new functions.https.HttpsError("invalid-argument", "convId es requerido");
    }
    try {
        const success = await decrementTokenOnConsultationComplete(uid, convId);
        return {
            success,
            message: success
                ? "Token decontado exitosamente"
                : "No hay tokens disponibles",
        };
    }
    catch (error) {
        console.error("[TOKENS] Error en consumeTokenOnConsultationEnd:", error);
        throw new functions.https.HttpsError("internal", error.message || "Error decontando token");
    }
});
//# sourceMappingURL=tokens.js.map