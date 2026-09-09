/**
 * @fileoverview Webhook de Instagram Messaging API (Meta Graph API) para el agente
 * de ventas. GET = verificación de suscripción, POST = mensajes entrantes → delega
 * en engine.ts. Usa el mismo Meta App que WhatsApp; requiere una cuenta profesional
 * de Instagram vinculada a una Página de Facebook en el Business Manager.
 */

import * as functions from "firebase-functions/v1";
import { handleInboundMessage } from "./engine";

const IG_VERIFY_TOKEN = process.env.IG_VERIFY_TOKEN || process.env.WHATSAPP_VERIFY_TOKEN;
const IG_PAGE_ACCESS_TOKEN = process.env.IG_PAGE_ACCESS_TOKEN;
const GRAPH_VERSION = "v21.0";

export async function sendInstagramMessage(recipientId: string, text: string): Promise<void> {
  if (!IG_PAGE_ACCESS_TOKEN) {
    throw new Error("IG_PAGE_ACCESS_TOKEN no configurado en el entorno.");
  }

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/me/messages?access_token=${encodeURIComponent(IG_PAGE_ACCESS_TOKEN)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text },
      }),
    }
  );

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Error enviando mensaje de Instagram: ${res.status} ${errBody}`);
  }
}

export const instagramWebhook = functions.region("us-central1").https.onRequest(async (req, res) => {
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && IG_VERIFY_TOKEN && token === IG_VERIFY_TOKEN) {
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
      const events = entry.messaging || [];
      for (const event of events) {
        const from = event.sender?.id;
        const text = event.message?.text;
        // Ignora ecos de nuestros propios mensajes salientes y mensajes sin texto
        // (stickers, reacciones, adjuntos).
        if (!from || !text || event.message?.is_echo) continue;

        await handleInboundMessage("instagram", from, text, sendInstagramMessage);
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error("[INSTAGRAM WEBHOOK] Error procesando mensaje entrante:", error);
    res.status(200).json({ received: true, error: true });
  }
});
