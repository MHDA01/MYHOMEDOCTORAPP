/**
 * @fileoverview Cloud Functions para integración con la pasarela de pagos Wompi.
 *
 * Flujo de pago:
 * 1. Cliente solicita crear un Payment Link (24,500 COP)
 * 2. Cloud Function crea el link en Wompi y guarda en Firestore (pending)
 * 3. Cliente redirige al usuario a payment_url de Wompi
 * 4. Webhook de Wompi → Firestore actualiza estado (success/failed)
 * 5. Cliente verifica estado y añade 210 tokens al usuario
 *
 * Nota: las variables de entorno conservan el prefijo WOMPY_ (heredado),
 * pero el proveedor real es Wompi (Bancolombia): api en production.wompi.co.
 */

import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import { wompiRequest } from "./wompi-client";
import { ACCESO_LIBRE } from "./acceso";

try {
  admin.initializeApp();
} catch (_) {
  // Ya inicializado
}

const db = admin.firestore();

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const WOMPY_PRIVATE_KEY = process.env.WOMPY_PRIVATE_KEY || process.env.WOMPY_API_KEY;
const WOMPY_EVENTS_SECRET = process.env.WOMPY_EVENTS_SECRET;
const WOMPY_REDIRECT_URL = process.env.WOMPY_REDIRECT_URL || process.env.WOMPY_SUCCESS_URL || 'https://myhomedoctorapp.web.app/dashboard/teleorientacion';
export const CONSULTATION_COST_COP = parseInt(process.env.CONSULTATION_COST_COP || "24500");
export const PAID_TOKENS_PER_MONTH = parseInt(process.env.PAID_TOKENS_PER_MONTH || "210");

const wompyRequest = wompiRequest;

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cloud Function: Crear transacción de pago en Wompy.
 * Llamado desde el cliente cuando el usuario elige el plan pagado.
 *
 * Requiere autenticación Firebase.
 */
export const initializeWompyPayment = functions
  .region("us-central1")
  .https.onCall(async (data, context) => {
    if (ACCESO_LIBRE) {
      throw new functions.https.HttpsError("failed-precondition", "MyHomeDoctorApp es gratuita en este momento.");
    }
    // Validar autenticación
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Usuario no autenticado"
      );
    }

    const uid = context.auth.uid;

    try {
      if (!WOMPY_PRIVATE_KEY) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "WOMPY_PRIVATE_KEY o WOMPY_API_KEY no está configurada en el entorno de funciones."
        );
      }

      // Obtener datos del usuario
      const userDoc = await db.collection("Cuentas_Tutor").doc(uid).get();
      if (!userDoc.exists) {
        throw new Error("Usuario no encontrado");
      }

      const userData = userDoc.data() as any;
      const reference = `teleorientacion_monthly_${uid}_${Date.now()}`;

      // Crear Payment Link en Wompi (API real: POST /v1/payment_links)
      // Nota: Wompi espera el monto en centavos (COP no tiene decimales, por eso x100)
      const wompyPayload = {
        name: "Plan Teleorientación Mensual",
        description: "Plan Teleorientación Mensual (7 consultas/día)",
        single_use: true,
        collect_shipping: false,
        currency: "COP",
        amount_in_cents: CONSULTATION_COST_COP * 100,
        redirect_url: WOMPY_REDIRECT_URL,
      };

      console.log(`[WOMPY] Iniciando pago para ${uid}:`, wompyPayload);

      const wompyResponse = await wompyRequest(
        "POST",
        "/v1/payment_links",
        wompyPayload
      );

      const wompyId = wompyResponse?.data?.id;
      if (!wompyId) {
        throw new Error(`Respuesta inesperada de Wompi: ${JSON.stringify(wompyResponse)}`);
      }
      const paymentUrl = `https://checkout.wompi.co/l/${wompyId}`;

      console.log(`[WOMPY] Respuesta de Wompi:`, wompyResponse);

      // Crear registro en Firestore
      const transactionRef = await db
        .collection("Cuentas_Tutor")
        .doc(uid)
        .collection("transactions")
        .add({
          wompy_id: wompyId,
          amount: CONSULTATION_COST_COP,
          status: "pending",
          type: "purchase",
          reference,
          payment_url: paymentUrl,
          description: wompyPayload.description,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

      console.log(`[WOMPY] Transacción guardada: ${transactionRef.id}`);

      return {
        success: true,
        transactionId: transactionRef.id,
        wompy_id: wompyId,
        payment_url: paymentUrl,
        amount: CONSULTATION_COST_COP,
      };

    } catch (error: any) {
      console.error("[WOMPY] Error en initializeWompyPayment:", error);
      throw new functions.https.HttpsError(
        "internal",
        error.message || "Error iniciando pago"
      );
    }
  });

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verifica el checksum de integridad que Wompi firma en cada evento de webhook,
 * usando WOMPY_EVENTS_SECRET. Sin esto cualquiera podría forjar un POST y
 * marcar una transacción como pagada sin haber pagado.
 */
function verifyWompiSignature(event: any): boolean {
  if (!WOMPY_EVENTS_SECRET) return false;

  const properties: string[] = event?.signature?.properties;
  const checksum: string = event?.signature?.checksum;
  const timestamp = event?.timestamp;

  if (!Array.isArray(properties) || !properties.length || !checksum || !timestamp) {
    return false;
  }

  const values = properties.map((path) =>
    path.split(".").reduce((obj: any, key: string) => obj?.[key], event.data)
  );

  const concatenated = values.join("") + timestamp + WOMPY_EVENTS_SECRET;
  const computed = crypto.createHash("sha256").update(concatenated).digest("hex");

  return computed.toLowerCase() === String(checksum).toLowerCase();
}

/**
 * Cloud Function: Webhook de Wompi.
 * Llamado por Wompi cuando una transacción cambia de estado.
 */
export const wompyWebhook = functions
  .region("us-central1")
  .https.onRequest(async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Método no permitido");
      return;
    }

    try {
      const event = req.body;

      console.log("[WOMPY WEBHOOK] Evento recibido:", event);

      if (!verifyWompiSignature(event)) {
        console.error("[WOMPY WEBHOOK] Firma inválida, evento rechazado");
        res.status(401).json({ error: "Firma inválida" });
        return;
      }

      // Validar que sea evento de transacción
      if (event.event !== "transaction.updated") {
        console.warn(`[WOMPY WEBHOOK] Evento ignorado: ${event.event}`);
        res.status(200).json({ received: true });
        return;
      }

      const transaction = event.data?.transaction;
      const wompy_id = transaction?.id;
      const status = transaction?.status; // APPROVED | DECLINED | VOIDED | ERROR
      const reference = transaction?.reference;

      if (!wompy_id || !reference) {
        console.error("[WOMPY WEBHOOK] Datos incompletos en webhook");
        res.status(400).json({ error: "Datos incompletos" });
        return;
      }

      // Extraer UID del reference (formato: teleorientacion_monthly_{uid}_{timestamp})
      const referenceParts = reference.split("_");
      const uid = referenceParts[2];

      if (!uid) {
        console.error("[WOMPY WEBHOOK] No se pudo extraer UID del reference");
        res.status(400).json({ error: "Reference inválido" });
        return;
      }

      // Buscar transacción en Firestore
      const transactionsRef = db
        .collection("Cuentas_Tutor")
        .doc(uid)
        .collection("transactions");

      const transactionSnap = await transactionsRef
        .where("wompy_id", "==", wompy_id)
        .limit(1)
        .get();

      if (transactionSnap.empty) {
        console.error(`[WOMPY WEBHOOK] Transacción no encontrada para wompy_id ${wompy_id}`);
        res.status(404).json({ error: "Transacción no encontrada" });
        return;
      }

      const transactionDoc = transactionSnap.docs[0];
      const existingStatus = transactionDoc.data()?.status;

      // Idempotencia: si ya se resolvió sincrónicamente (createPaymentSource /
      // chargeMonthlySubscriptions consultan y esperan la respuesta de Wompi),
      // no volver a acreditar tokens cuando llegue este mismo evento por webhook.
      if (existingStatus === "success" || existingStatus === "failed") {
        console.log(`[WOMPY WEBHOOK] Transacción ${transactionDoc.id} ya estaba finalizada (${existingStatus}), se ignora`);
        res.status(200).json({ received: true, alreadyProcessed: true });
        return;
      }

      const newStatus = status === "APPROVED" ? "success" : "failed";
      const isRecurring = reference.startsWith("teleorientacion_recurring_");

      await transactionDoc.ref.update({
        status: newStatus,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`[WOMPY WEBHOOK] Transacción actualizada: ${transactionDoc.id} → ${newStatus}`);

      const tokensRef = db.collection("Cuentas_Tutor").doc(uid).collection("tokens").doc("config");

      if (newStatus === "success") {
        const nextBillingDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        await tokensRef.set(
          {
            paid: admin.firestore.FieldValue.increment(PAID_TOKENS_PER_MONTH),
            planExpires: nextBillingDate,
            ...(isRecurring && {
              autoRenew: true,
              subscriptionStatus: "active",
              nextBillingDate,
              failedChargeAttempts: 0,
            }),
          },
          { merge: true }
        );

        console.log(
          `[WOMPY WEBHOOK] ✅ Tokens añadidos a ${uid}: +${PAID_TOKENS_PER_MONTH}`
        );
      } else if (isRecurring) {
        await tokensRef.set({ subscriptionStatus: "payment_failed" }, { merge: true });
        console.log(`[WOMPY WEBHOOK] ❌ Cobro recurrente rechazado (confirmado por webhook) para ${uid}`);
      }

      res.status(200).json({ received: true });

    } catch (error) {
      console.error("[WOMPY WEBHOOK] Error:", error);
      res.status(500).json({ error: "Error procesando webhook" });
    }
  });
