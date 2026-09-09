/**
 * @fileoverview Orquestador del agente de ventas, compartido entre WhatsApp,
 * Instagram y la consola manual: carga el estado del lead, consulta al modelo,
 * persiste lo capturado y genera el link de pago si toca. `processInboundMessage`
 * NO envía nada — solo decide; quien la llama decide cómo entregar la respuesta
 * (automático vía Graph API, o manual copiando/pegando).
 */

import { getOrCreateLead, appendMessage, getRecentHistory, updateLeadState } from "./store";
import { decideNextReply } from "./llm-client";
import { createLeadPaymentLink } from "./payment";
import { Channel, SalesStage, CapturedVariables } from "./types";

export interface EngineResult {
  replies: string[];
  stage: SalesStage;
  captured: CapturedVariables;
  converted: boolean;
}

export async function processInboundMessage(
  channel: Channel,
  externalId: string,
  text: string
): Promise<EngineResult> {
  const lead = await getOrCreateLead(channel, externalId);

  // Ya convertido: no reabrir el flujo de ventas automáticamente sobre un cliente pago.
  if (lead.converted) {
    return { replies: [], stage: lead.stage, captured: lead.captured, converted: true };
  }

  await appendMessage(channel, externalId, "user", text);
  const history = await getRecentHistory(channel, externalId);

  const decision = await decideNextReply(history, lead.stage, lead.captured);

  await updateLeadState(channel, externalId, decision.stage, decision.captured);
  await appendMessage(channel, externalId, "assistant", decision.reply);

  const replies = [decision.reply];

  if (decision.sendPaymentLink && decision.captured.email) {
    try {
      const paymentUrl = await createLeadPaymentLink(
        channel,
        externalId,
        decision.captured.email,
        decision.captured.nombre_usuario
      );
      const linkMessage = `Aquí tienes tu link de pago seguro (Wompi): ${paymentUrl}`;
      await appendMessage(channel, externalId, "assistant", linkMessage);
      replies.push(linkMessage);
    } catch (error) {
      console.error(`[SALES ENGINE] Error generando link de pago para ${channel}_${externalId}:`, error);
      const fallbackMessage =
        "Tuvimos un problema generando tu link de pago. Un asesor te va a escribir en breve para ayudarte a completar la suscripción.";
      await appendMessage(channel, externalId, "assistant", fallbackMessage);
      replies.push(fallbackMessage);
    }
  }

  return { replies, stage: decision.stage, captured: decision.captured, converted: false };
}

type SendFn = (externalId: string, text: string) => Promise<void>;

/** Usado por los webhooks automáticos (WhatsApp/Instagram): decide y envía. */
export async function handleInboundMessage(
  channel: Channel,
  externalId: string,
  text: string,
  send: SendFn
): Promise<void> {
  const result = await processInboundMessage(channel, externalId, text);
  for (const message of result.replies) {
    await send(externalId, message);
  }
}
