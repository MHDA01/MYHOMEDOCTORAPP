/**
 * @fileoverview Webhook de Wompi para pagos de leads del agente de ventas (todavía
 * sin cuenta en Cuentas_Tutor). Deliberadamente separado de `wompyWebhook` (pagos de
 * usuarios ya registrados) para no arriesgar el flujo de cobro de producción existente.
 */

import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import { leadRef } from "./store";
import { Channel } from "./types";
import { sendWhatsAppMessage } from "./whatsapp-webhook";
import { sendInstagramMessage } from "./instagram-webhook";

try {
  admin.initializeApp();
} catch (_) {
  // Ya inicializado
}

const WOMPY_EVENTS_SECRET = process.env.WOMPY_EVENTS_SECRET;

function verifyWompiSignature(event: any): boolean {
  if (!WOMPY_EVENTS_SECRET) return false;

  const properties: string[] = event?.signature?.properties;
  const checksum: string = event?.signature?.checksum;
  const timestamp = event?.timestamp;

  if (!Array.isArray(properties) || !properties.length || !checksum || !timestamp) {
    return false;
  }

  const values = properties.map((path) => path.split(".").reduce((obj: any, key: string) => obj?.[key], event.data));
  const concatenated = values.join("") + timestamp + WOMPY_EVENTS_SECRET;
  const computed = crypto.createHash("sha256").update(concatenated).digest("hex");

  return computed.toLowerCase() === String(checksum).toLowerCase();
}

export const leadWompiWebhook = functions.region("us-central1").https.onRequest(async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Método no permitido");
    return;
  }

  try {
    const event = req.body;

    if (!verifyWompiSignature(event)) {
      console.error("[LEAD PAYMENT WEBHOOK] Firma inválida, evento rechazado");
      res.status(401).json({ error: "Firma inválida" });
      return;
    }

    if (event.event !== "transaction.updated") {
      res.status(200).json({ received: true });
      return;
    }

    const transaction = event.data?.transaction;
    const wompyId = transaction?.id;
    const status = transaction?.status; // APPROVED | DECLINED | VOIDED | ERROR
    const reference: string = transaction?.reference || "";

    if (!wompyId || !reference.startsWith("lead_")) {
      // No es un pago generado por el agente de ventas (probablemente le corresponde
      // a wompyWebhook) — se ignora aquí.
      res.status(200).json({ received: true, ignored: true });
      return;
    }

    const parts = reference.split("_");
    const channel = parts[1] as Channel;
    const externalId = parts[2];

    if (!channel || !externalId) {
      console.error("[LEAD PAYMENT WEBHOOK] No se pudo extraer channel/externalId del reference:", reference);
      res.status(400).json({ error: "Reference inválido" });
      return;
    }

    const ref = leadRef(channel, externalId);
    const leadSnap = await ref.get();
    if (!leadSnap.exists) {
      console.error(`[LEAD PAYMENT WEBHOOK] Lead no encontrado: ${channel}_${externalId}`);
      res.status(404).json({ error: "Lead no encontrado" });
      return;
    }

    const txSnap = await ref.collection("transactions").where("wompy_id", "==", wompyId).limit(1).get();
    if (!txSnap.empty) {
      const existingStatus = txSnap.docs[0].data()?.status;
      if (existingStatus === "success" || existingStatus === "failed") {
        res.status(200).json({ received: true, alreadyProcessed: true });
        return;
      }
      await txSnap.docs[0].ref.update({
        status: status === "APPROVED" ? "success" : "failed",
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    if (status === "APPROVED") {
      await ref.update({ converted: true, stage: "cerrado_pago" });

      const confirmMessage =
        "¡Listo! Tu pago fue aprobado. Ya tienes tu suscripción a My Home Doctor activa a precio fundador. " +
        "Para terminar de activar tu cuenta, descarga la app y regístrate con este mismo correo — te llegará " +
        "la confirmación en unos minutos.";

      try {
        if (channel === "whatsapp") {
          await sendWhatsAppMessage(externalId, confirmMessage);
        } else {
          await sendInstagramMessage(externalId, confirmMessage);
        }
      } catch (sendError) {
        console.error(`[LEAD PAYMENT WEBHOOK] Pago aprobado pero falló el envío de confirmación a ${channel}_${externalId}:`, sendError);
      }

      console.log(`[LEAD PAYMENT WEBHOOK] Lead convertido: ${channel}_${externalId}`);
    } else {
      console.log(`[LEAD PAYMENT WEBHOOK] Pago de lead no aprobado (${status}): ${channel}_${externalId}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error("[LEAD PAYMENT WEBHOOK] Error:", error);
    res.status(500).json({ error: "Error procesando webhook" });
  }
});
