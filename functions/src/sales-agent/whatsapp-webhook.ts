/**
 * @fileoverview Webhook de WhatsApp Cloud API (directo con Meta, sin intermediario)
 * para el agente de ventas. GET = verificación de suscripción, POST = mensajes
 * entrantes → delega en engine.ts.
 *
 * Requiere en Meta for Developers: número de WhatsApp registrado en el Cloud API,
 * y este endpoint desplegado configurado como Callback URL del webhook de la app.
 */

import * as functions from "firebase-functions/v1";
import { handleInboundMessage } from "./engine";

const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const GRAPH_VERSION = "v21.0";

export async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    throw new Error("WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID no configurados en el entorno.");
  }

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Error enviando mensaje de WhatsApp: ${res.status} ${errBody}`);
  }
}

export const whatsappWebhook = functions.region("us-central1").https.onRequest(async (req, res) => {
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && WHATSAPP_VERIFY_TOKEN && token === WHATSAPP_VERIFY_TOKEN) {
      res.status(200).send(challenge);
      return;
    }

    res.status(403).send("Verificación fallida");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).send("Método no permitido");
    return;
  }

  try {
    const entries = req.body?.entry || [];

    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const messages = change.value?.messages || [];
        for (const message of messages) {
          const from = message.from;
          const text = message.text?.body;
          if (!from || !text) continue;

          await handleInboundMessage("whatsapp", from, text, sendWhatsAppMessage);
        }
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error("[WHATSAPP WEBHOOK] Error procesando mensaje entrante:", error);
    // Igual respondemos 200: Meta reintenta agresivamente sin un 200, y el reintento
    // no resolvería un error de lógica interna.
    res.status(200).json({ received: true, error: true });
  }
});
