"use strict";
/**
 * @fileoverview Orquestador del agente de ventas, compartido entre WhatsApp,
 * Instagram y la consola manual: carga el estado del lead, consulta al modelo,
 * persiste lo capturado y genera el link de pago si toca. `processInboundMessage`
 * NO envía nada — solo decide; quien la llama decide cómo entregar la respuesta
 * (automático vía Graph API, o manual copiando/pegando).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.processInboundMessage = processInboundMessage;
exports.handleInboundMessage = handleInboundMessage;
const store_1 = require("./store");
const llm_client_1 = require("./llm-client");
const payment_1 = require("./payment");
async function processInboundMessage(channel, externalId, text) {
    const lead = await (0, store_1.getOrCreateLead)(channel, externalId);
    // Ya convertido: no reabrir el flujo de ventas automáticamente sobre un cliente pago.
    if (lead.converted) {
        return { replies: [], stage: lead.stage, captured: lead.captured, converted: true };
    }
    await (0, store_1.appendMessage)(channel, externalId, "user", text);
    const history = await (0, store_1.getRecentHistory)(channel, externalId);
    const decision = await (0, llm_client_1.decideNextReply)(history, lead.stage, lead.captured);
    await (0, store_1.updateLeadState)(channel, externalId, decision.stage, decision.captured);
    await (0, store_1.appendMessage)(channel, externalId, "assistant", decision.reply);
    const replies = [decision.reply];
    if (decision.sendPaymentLink && decision.captured.email) {
        try {
            const paymentUrl = await (0, payment_1.createLeadPaymentLink)(channel, externalId, decision.captured.email, decision.captured.nombre_usuario);
            const linkMessage = `Aquí tienes tu link de pago seguro (Wompi): ${paymentUrl}`;
            await (0, store_1.appendMessage)(channel, externalId, "assistant", linkMessage);
            replies.push(linkMessage);
        }
        catch (error) {
            console.error(`[SALES ENGINE] Error generando link de pago para ${channel}_${externalId}:`, error);
            const fallbackMessage = "Tuvimos un problema generando tu link de pago. Un asesor te va a escribir en breve para ayudarte a completar la suscripción.";
            await (0, store_1.appendMessage)(channel, externalId, "assistant", fallbackMessage);
            replies.push(fallbackMessage);
        }
    }
    return { replies, stage: decision.stage, captured: decision.captured, converted: false };
}
/** Usado por los webhooks automáticos (WhatsApp/Instagram): decide y envía. */
async function handleInboundMessage(channel, externalId, text, send) {
    const result = await processInboundMessage(channel, externalId, text);
    for (const message of result.replies) {
        await send(externalId, message);
    }
}
//# sourceMappingURL=engine.js.map