/**
 * @fileoverview Cloud Functions para integración con la pasarela de pagos Wompi.
 *
 * Flujo de pago:
 * 1. Cliente solicita crear un Payment Link (24,500 COP)
 * 2. Cloud Function crea el link en Wompi y guarda en Firestore (pending)
 * 3. Cliente redirige al usuario a payment_url de Wompi
 * 4. Webhook de Wompi → Firestore actualiza estado (success/failed)
 * 5. Cliente verifica estado y añade al usuario las consultas del mes
 *    (PAID_TOKENS_PER_MONTH)
 *
 * Nota: las variables de entorno conservan el prefijo WOMPY_ (heredado),
 * pero el proveedor real es Wompi (Bancolombia): api en production.wompi.co.
 */

import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import { wompiRequest } from "./wompi-client";
import { ACCESO_LIBRE } from "./acceso";
import { uidDeReferencia } from "./cobro-idempotente";
import { camposTrasCobroAprobado } from "./estado-suscripcion";
import { enviarComprobante } from "./comprobante";

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
const WOMPY_REDIRECT_URL = process.env.WOMPY_REDIRECT_URL || process.env.WOMPY_SUCCESS_URL || 'https://myhomedoctorapp.com/dashboard/teleorientacion';
// Lo que se cobra al mes por el plan Familias Fundadoras. Tiene que valer lo
// mismo que PRECIO_MENSUAL_COP en src/config/precio.ts, que es lo que la
// ventana de pago le muestra a la persona: hasta el 10-nov-2026 la pantalla
// decía 19.900 y aquí se cobraban 24.500. Si mueves la variable de entorno,
// mueve también ese archivo.
export const CONSULTATION_COST_COP = parseInt(process.env.CONSULTATION_COST_COP || "34900");
// Consultas que trae el plan al mes, para todo el núcleo familiar: el saldo es
// de la cuenta del titular y lo comparten los integrantes. Decisión del
// 10-nov-2026: 100 al mes (unas 20 por integrante en una familia de cinco), en
// vez de las 210 de antes. Tiene que valer lo mismo que CONSULTAS_POR_MES en
// src/config/precio.ts, que es lo que la ventana de pago promete.
export const PAID_TOKENS_PER_MONTH = parseInt(process.env.PAID_TOKENS_PER_MONTH || "100");

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
        name: "Plan Familias Fundadoras",
        description: `Plan Familias Fundadoras · mensual (hasta ${PAID_TOKENS_PER_MONTH} consultas al mes para el núcleo familiar)`,
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

      // Extraer UID del reference (formato: teleorientacion_{monthly|recurring}_{uid}_{...}).
      // Si no tiene uno de los dos prefijos conocidos, no se toca ninguna cuenta.
      const uid = uidDeReferencia(reference);

      if (!uid) {
        console.error(`[WOMPY WEBHOOK] Reference que no reconozco, se ignora: ${reference}`);
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
      const isRecurring = reference.startsWith("teleorientacion_recurring_");
      const tokensRef = db.collection("Cuentas_Tutor").doc(uid).collection("tokens").doc("config");

      // Todo en una transacción: leer el estado, marcarlo como final y acreditar
      // los tokens tienen que pasar juntos o no pasar.
      //
      // Wompi entrega cada evento "al menos una vez" y reintenta si no ve un
      // 200. Sin transacción, dos entregas simultáneas leían las dos "pending",
      // las dos pasaban el control de idempotencia y las dos sumaban 210 tokens.
      // Y si la acreditación fallaba después de marcar la transacción como
      // exitosa, el usuario pagaba y se quedaba sin tokens.
      const resultado = await db.runTransaction(async (t) => {
        const snap = await t.get(transactionDoc.ref);
        const estadoActual = snap.get("status");
        // Se lee antes de escribir (una transacción de Firestore lo exige): hace falta
        // saber si la persona canceló mientras el cobro estaba en confirmación.
        const tokensActual = (await t.get(tokensRef)).data();

        // Ya se resolvió sincrónicamente (createPaymentSource /
        // chargeMonthlySubscriptions esperan la respuesta de Wompi) o por otra
        // entrega de este mismo evento.
        if (estadoActual === "success" || estadoActual === "failed") return null;

        const nuevoEstado = status === "APPROVED" ? "success" : "failed";
        t.update(transactionDoc.ref, {
          status: nuevoEstado,
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        if (nuevoEstado === "success") {
          const nextBillingDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          t.set(
            tokensRef,
            {
              paid: admin.firestore.FieldValue.increment(PAID_TOKENS_PER_MONTH),
              planExpires: nextBillingDate,
              // El ciclo quedó resuelto: se libera el reclamo del cobro mensual.
              cobroEnCurso: admin.firestore.FieldValue.delete(),
              ...camposTrasCobroAprobado(tokensActual, isRecurring, nextBillingDate),
            },
            { merge: true }
          );
        } else if (isRecurring) {
          t.set(
            tokensRef,
            { subscriptionStatus: "payment_failed", cobroEnCurso: admin.firestore.FieldValue.delete() },
            { merge: true }
          );
        }

        return nuevoEstado;
      });

      if (resultado === null) {
        console.log(`[WOMPY WEBHOOK] Transacción ${transactionDoc.id} ya estaba finalizada, se ignora`);
        res.status(200).json({ received: true, alreadyProcessed: true });
        return;
      }

      console.log(`[WOMPY WEBHOOK] Transacción actualizada: ${transactionDoc.id} → ${resultado}`);
      if (resultado === "success") {
        console.log(`[WOMPY WEBHOOK] ✅ Tokens añadidos a ${uid}: +${PAID_TOKENS_PER_MONTH}`);

        // Comprobante del cobro que se resolvió aquí (los que se aprobaron al
        // momento ya lo mandaron quien los cobró, y el control de idempotencia de
        // arriba impide que este camino los repita).
        const tx = transactionDoc.data() as any;
        const hoy = (await tokensRef.get()).data() as any;
        const proximo = hoy?.autoRenew === true ? hoy?.nextBillingDate : null;
        await enviarComprobante(db, uid, {
          valorCop: Number(tx?.amount ?? CONSULTATION_COST_COP),
          referencia: String(tx?.reference ?? reference),
          idWompi: tx?.wompy_id ?? wompy_id,
          concepto: String(tx?.description ?? "Plan Familias Fundadoras"),
          consultas: PAID_TOKENS_PER_MONTH,
          proximoCobro: typeof proximo?.toDate === "function" ? proximo.toDate() : proximo ? new Date(proximo) : null,
        });
      } else if (isRecurring) {
        console.log(`[WOMPY WEBHOOK] ❌ Cobro recurrente rechazado (confirmado por webhook) para ${uid}`);
      }

      res.status(200).json({ received: true });

    } catch (error) {
      console.error("[WOMPY WEBHOOK] Error:", error);
      res.status(500).json({ error: "Error procesando webhook" });
    }
  });
