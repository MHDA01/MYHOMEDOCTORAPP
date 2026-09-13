"use strict";
/**
 * @fileoverview Cloud Functions para renovación automática mensual (suscripción) vía Wompi.
 *
 * Wompi no tiene un endpoint de "suscripción": el patrón es tokenizar la tarjeta
 * una sola vez (Payment Source, referencia opaca — nunca el número real) y
 * cobrar ese Payment Source automáticamente cada 30 días desde el backend.
 *
 * Cumplimiento normativo (Colombia):
 * - Ley 1581/2012 (habeas data): se exige `acceptance_token` + `accept_personal_auth`
 *   (entregados por el propio widget de Wompi tras mostrarle al usuario los textos
 *   legales) antes de guardar la tarjeta. Se registra el timestamp de aceptación.
 * - Ley 1480/2011 (estatuto del consumidor): el usuario puede cancelar en cualquier
 *   momento (`cancelAutoRenewal`) sin que eso afecte el período ya pagado.
 * - PCI-DSS: el número de tarjeta se tokeniza en el navegador contra Wompi
 *   directamente; este backend nunca recibe ni almacena el PAN.
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
exports.chargeMonthlySubscriptions = exports.sendRenewalReminders = exports.cancelAutoRenewal = exports.createPaymentSource = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const crypto = __importStar(require("crypto"));
const wompi_client_1 = require("./wompi-client");
const email_1 = require("./email");
const wompy_1 = require("./wompy");
const acceso_1 = require("./acceso");
try {
    admin.initializeApp();
}
catch (_) {
    // Ya inicializado
}
const db = admin.firestore();
const WOMPY_INTEGRITY_SECRET = process.env.WOMPY_INTEGRITY_SECRET;
const MAX_CHARGE_RETRIES = 3;
const RENEWAL_REMINDER_DAYS_BEFORE = 3;
function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
// ─────────────────────────────────────────────────────────────────────────────
// HELPER: cobrar un Payment Source existente
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Wompi exige una "firma de integridad" incluso en transacciones autenticadas
 * con la llave privada: SHA256(reference + amount_in_cents + currency + integritySecret).
 */
function buildIntegritySignature(reference, amountInCents, currency) {
    return crypto
        .createHash("sha256")
        .update(`${reference}${amountInCents}${currency}${WOMPY_INTEGRITY_SECRET}`)
        .digest("hex");
}
async function chargeSubscription(uid, userEmail, paymentSourceId) {
    const reference = `teleorientacion_recurring_${uid}_${Date.now()}`;
    const amountInCents = wompy_1.CONSULTATION_COST_COP * 100;
    const wompyResponse = await (0, wompi_client_1.wompiRequest)("POST", "/v1/transactions", {
        amount_in_cents: amountInCents,
        currency: "COP",
        customer_email: userEmail,
        payment_source_id: paymentSourceId,
        payment_method: { installments: 1 },
        reference,
        signature: buildIntegritySignature(reference, amountInCents, "COP"),
    });
    let transaction = wompyResponse === null || wompyResponse === void 0 ? void 0 : wompyResponse.data;
    if (!(transaction === null || transaction === void 0 ? void 0 : transaction.id)) {
        throw new Error(`Respuesta inesperada de Wompi al cobrar: ${JSON.stringify(wompyResponse)}`);
    }
    // Los cargos con tarjeta guardada suelen resolver en pocos segundos: esperamos
    // un poco antes de tratarlo como "pendiente" definitivo (el webhook lo confirma después).
    for (let attempt = 0; attempt < 5 && transaction.status === "PENDING"; attempt++) {
        await wait(2000);
        const check = await (0, wompi_client_1.wompiRequest)("GET", `/v1/transactions/${transaction.id}`);
        if (check === null || check === void 0 ? void 0 : check.data)
            transaction = check.data;
    }
    const status = transaction.status === "APPROVED" ? "APPROVED" : transaction.status === "PENDING" ? "PENDING" : "DECLINED";
    const firestoreStatus = status === "APPROVED" ? "success" : status === "PENDING" ? "pending" : "failed";
    await db
        .collection("Cuentas_Tutor")
        .doc(uid)
        .collection("transactions")
        .add(Object.assign({ wompy_id: transaction.id, amount: wompy_1.CONSULTATION_COST_COP, status: firestoreStatus, type: "recurring", reference, description: "Renovación automática - Plan Teleorientación Mensual", createdAt: admin.firestore.FieldValue.serverTimestamp() }, (firestoreStatus !== "pending" && { completedAt: admin.firestore.FieldValue.serverTimestamp() })));
    return { result: status, wompyId: transaction.id };
}
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Cloud Function: activar renovación automática.
 * Recibe el token de tarjeta ya tokenizado por el widget de Wompi en el
 * navegador del cliente, junto con los tokens de aceptación de T&C y de
 * autorización de tratamiento de datos personales que el mismo widget entrega.
 */
exports.createPaymentSource = functions
    .region("us-central1")
    .https.onCall(async (data, context) => {
    var _a;
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
    }
    if (acceso_1.ACCESO_LIBRE) {
        throw new functions.https.HttpsError("failed-precondition", "MyHomeDoctorApp es gratuita en este momento.");
    }
    const uid = context.auth.uid;
    const { cardToken, acceptanceToken, acceptPersonalAuthToken } = data || {};
    if (!cardToken || !acceptanceToken || !acceptPersonalAuthToken) {
        throw new functions.https.HttpsError("invalid-argument", "Faltan datos de tokenización o de aceptación de términos");
    }
    try {
        const userDoc = await db.collection("Cuentas_Tutor").doc(uid).get();
        if (!userDoc.exists) {
            throw new Error("Usuario no encontrado");
        }
        const userData = userDoc.data();
        const userEmail = userData.email || `user-${uid}@myhomedoctorapp.local`;
        // 1. Crear Payment Source (guarda la tarjeta tokenizada del lado de Wompi)
        const sourceResponse = await (0, wompi_client_1.wompiRequest)("POST", "/v1/payment_sources", {
            type: "CARD",
            token: cardToken,
            customer_email: userEmail,
            acceptance_token: acceptanceToken,
            accept_personal_auth: acceptPersonalAuthToken,
        });
        const paymentSourceId = (_a = sourceResponse === null || sourceResponse === void 0 ? void 0 : sourceResponse.data) === null || _a === void 0 ? void 0 : _a.id;
        if (!paymentSourceId) {
            throw new Error(`Respuesta inesperada de Wompi al crear payment source: ${JSON.stringify(sourceResponse)}`);
        }
        const tokensRef = db.collection("Cuentas_Tutor").doc(uid).collection("tokens").doc("config");
        // 2. Cobrar el primer período inmediatamente (mismo comportamiento que el pago único)
        const charge = await chargeSubscription(uid, userEmail, paymentSourceId);
        const now = admin.firestore.Timestamp.now();
        const consentFields = {
            paymentSourceId,
            consentAcceptedAt: now,
            consentAcceptanceToken: acceptanceToken,
            consentPersonalAuthToken: acceptPersonalAuthToken,
        };
        if (charge.result === "APPROVED") {
            const nextBillingDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
            await tokensRef.set(Object.assign(Object.assign({}, consentFields), { autoRenew: true, subscriptionStatus: "active", nextBillingDate, paid: admin.firestore.FieldValue.increment(wompy_1.PAID_TOKENS_PER_MONTH), planExpires: nextBillingDate }), { merge: true });
            console.log(`[SUBSCRIPTION] Renovación automática activada para ${uid}`);
            return { success: true, status: "active", wompy_id: charge.wompyId };
        }
        if (charge.result === "PENDING") {
            // Aún no se resuelve: guardamos la tarjeta y dejamos que el webhook confirme
            // (activa autoRenew/otorga tokens) cuando Wompi finalice la transacción.
            await tokensRef.set(Object.assign(Object.assign({}, consentFields), { autoRenew: false, subscriptionStatus: "pending" }), { merge: true });
            console.log(`[SUBSCRIPTION] Cargo pendiente de confirmación para ${uid}`);
            return { success: true, status: "pending", wompy_id: charge.wompyId };
        }
        // El cargo inicial fue rechazado: guardamos la tarjeta pero no activamos autoRenew
        await tokensRef.set(Object.assign(Object.assign({}, consentFields), { autoRenew: false, subscriptionStatus: "payment_failed" }), { merge: true });
        throw new functions.https.HttpsError("aborted", "El cobro no fue aprobado por el banco. Intenta con otra tarjeta.");
    }
    catch (error) {
        console.error("[SUBSCRIPTION] Error en createPaymentSource:", error);
        if (error instanceof functions.https.HttpsError)
            throw error;
        throw new functions.https.HttpsError("internal", error.message || "Error activando renovación automática");
    }
});
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Cloud Function: cancelar renovación automática.
 * Detiene cobros futuros; no afecta el período ya pagado ni los tokens vigentes.
 */
exports.cancelAutoRenewal = functions
    .region("us-central1")
    .https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
    }
    const uid = context.auth.uid;
    try {
        const tokensRef = db.collection("Cuentas_Tutor").doc(uid).collection("tokens").doc("config");
        await tokensRef.update({
            autoRenew: false,
            subscriptionStatus: "cancelled",
        });
        console.log(`[SUBSCRIPTION] Renovación automática cancelada para ${uid}`);
        return { success: true };
    }
    catch (error) {
        console.error("[SUBSCRIPTION] Error en cancelAutoRenewal:", error);
        throw new functions.https.HttpsError("internal", error.message || "Error cancelando renovación automática");
    }
});
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Cloud Function programada: envía un aviso por correo 3 días antes del próximo cobro.
 */
exports.sendRenewalReminders = functions
    .region("us-central1")
    .pubsub.schedule("0 15 * * *") // 15:00 UTC ≈ 10:00 Bogotá
    .timeZone("UTC")
    .onRun(async () => {
    var _a, _b;
    if (acceso_1.ACCESO_LIBRE) {
        console.log("[SUBSCRIPTION] Acceso libre: avisos de renovación omitidos.");
        return null;
    }
    console.log("[SUBSCRIPTION] Buscando renovaciones próximas para enviar aviso.");
    const now = new Date();
    const targetDate = new Date(now.getTime() + RENEWAL_REMINDER_DAYS_BEFORE * 24 * 60 * 60 * 1000);
    const targetDayStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    const targetDayEnd = new Date(targetDayStart.getTime() + 24 * 60 * 60 * 1000);
    try {
        const dueSoonSnap = await db
            .collectionGroup("tokens")
            .where("autoRenew", "==", true)
            .where("nextBillingDate", ">=", targetDayStart)
            .where("nextBillingDate", "<", targetDayEnd)
            .get();
        for (const tokenDoc of dueSoonSnap.docs) {
            const uid = (_a = tokenDoc.ref.parent.parent) === null || _a === void 0 ? void 0 : _a.id;
            if (!uid)
                continue;
            const userDoc = await db.collection("Cuentas_Tutor").doc(uid).get();
            const userEmail = (_b = userDoc.data()) === null || _b === void 0 ? void 0 : _b.email;
            if (!userEmail)
                continue;
            await (0, email_1.sendEmail)(userEmail, "Tu renovación de Teleorientación se procesará en 3 días", `<p>Hola,</p>
           <p>Te confirmamos que en 3 días se procesará el cobro automático de tu plan mensual de Teleorientación por <strong>$${wompy_1.CONSULTATION_COST_COP.toLocaleString("es-CO")} COP</strong>.</p>
           <p>Si no deseas continuar, puedes cancelar la renovación automática en cualquier momento desde tu cuenta en MyHomeDoctorApp, sección "Mi cuenta", sin ningún costo.</p>
           <p>Gracias por confiar en nosotros.</p>`);
        }
        console.log(`[SUBSCRIPTION] Avisos de renovación enviados: ${dueSoonSnap.size}`);
    }
    catch (error) {
        console.error("[SUBSCRIPTION] Error enviando avisos de renovación:", error);
    }
    return null;
});
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Cloud Function programada: cobra automáticamente las suscripciones vencidas.
 * Reintenta hasta MAX_CHARGE_RETRIES días consecutivos antes de auto-cancelar.
 */
exports.chargeMonthlySubscriptions = functions
    .region("us-central1")
    .pubsub.schedule("0 15 * * *") // 15:00 UTC ≈ 10:00 Bogotá
    .timeZone("UTC")
    .onRun(async () => {
    var _a;
    if (acceso_1.ACCESO_LIBRE) {
        // Etapa gratuita: nadie debe recibir un cobro por una app gratis.
        console.log("[SUBSCRIPTION] Acceso libre: cobros automáticos omitidos.");
        return null;
    }
    console.log("[SUBSCRIPTION] Procesando cobros automáticos vencidos.");
    const now = new Date();
    try {
        const dueSnap = await db
            .collectionGroup("tokens")
            .where("autoRenew", "==", true)
            .where("nextBillingDate", "<=", now)
            .get();
        for (const tokenDoc of dueSnap.docs) {
            const uid = (_a = tokenDoc.ref.parent.parent) === null || _a === void 0 ? void 0 : _a.id;
            if (!uid)
                continue;
            const tokenData = tokenDoc.data();
            const paymentSourceId = tokenData.paymentSourceId;
            const failedAttempts = tokenData.failedChargeAttempts || 0;
            if (!paymentSourceId) {
                console.warn(`[SUBSCRIPTION] ${uid} tiene autoRenew activo sin paymentSourceId, se ignora`);
                continue;
            }
            const userDoc = await db.collection("Cuentas_Tutor").doc(uid).get();
            const userData = userDoc.data();
            const userEmail = (userData === null || userData === void 0 ? void 0 : userData.email) || `user-${uid}@myhomedoctorapp.local`;
            try {
                const charge = await chargeSubscription(uid, userEmail, paymentSourceId);
                if (charge.result === "APPROVED") {
                    const nextBillingDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                    await tokenDoc.ref.update({
                        paid: admin.firestore.FieldValue.increment(wompy_1.PAID_TOKENS_PER_MONTH),
                        planExpires: nextBillingDate,
                        nextBillingDate,
                        subscriptionStatus: "active",
                        failedChargeAttempts: 0,
                    });
                    console.log(`[SUBSCRIPTION] ✅ Cobro recurrente exitoso para ${uid}`);
                    if (userEmail) {
                        await (0, email_1.sendEmail)(userEmail, "Renovación de Teleorientación confirmada", `<p>Hola,</p>
                 <p>Tu renovación mensual por <strong>$${wompy_1.CONSULTATION_COST_COP.toLocaleString("es-CO")} COP</strong> fue aprobada. Se añadieron ${wompy_1.PAID_TOKENS_PER_MONTH} tokens a tu cuenta.</p>
                 <p>Puedes cancelar la renovación automática en cualquier momento desde "Mi cuenta".</p>`);
                    }
                }
                else if (charge.result === "PENDING") {
                    // Todavía no se resuelve: el webhook lo confirmará (no consumimos reintentos).
                    await tokenDoc.ref.update({ subscriptionStatus: "pending" });
                    console.log(`[SUBSCRIPTION] Cobro recurrente pendiente de confirmación para ${uid}`);
                }
                else {
                    const attempts = failedAttempts + 1;
                    const shouldCancel = attempts >= MAX_CHARGE_RETRIES;
                    await tokenDoc.ref.update({
                        subscriptionStatus: "payment_failed",
                        autoRenew: !shouldCancel,
                        failedChargeAttempts: attempts,
                    });
                    console.warn(`[SUBSCRIPTION] ❌ Cobro recurrente rechazado para ${uid} (intento ${attempts}/${MAX_CHARGE_RETRIES})`);
                    if (userEmail) {
                        await (0, email_1.sendEmail)(userEmail, shouldCancel
                            ? "No pudimos procesar tu renovación - suscripción cancelada"
                            : "No pudimos procesar tu renovación de Teleorientación", shouldCancel
                            ? `<p>Hola,</p><p>Intentamos cobrar tu renovación automática ${MAX_CHARGE_RETRIES} veces sin éxito, así que la desactivamos. Puedes volver a activarla cuando quieras desde "Mi cuenta" con una tarjeta válida.</p>`
                            : `<p>Hola,</p><p>No pudimos procesar el cobro de tu renovación automática. Vamos a reintentarlo en las próximas 24 horas. Verifica que tu tarjeta tenga fondos o cupo disponible.</p>`);
                    }
                }
            }
            catch (chargeError) {
                console.error(`[SUBSCRIPTION] Error cobrando suscripción de ${uid}:`, chargeError);
            }
        }
        console.log(`[SUBSCRIPTION] Cobros procesados: ${dueSnap.size}`);
    }
    catch (error) {
        console.error("[SUBSCRIPTION] Error general en chargeMonthlySubscriptions:", error);
    }
    return null;
});
//# sourceMappingURL=subscription.js.map