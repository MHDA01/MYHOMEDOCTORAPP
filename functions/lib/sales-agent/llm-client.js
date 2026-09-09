"use strict";
/**
 * @fileoverview Motor conversacional del agente de ventas — corre sobre la API de
 * Gemini (misma llave que ya usa daily-health-tips.ts). Pide salida en JSON puro
 * en vez de tool-use nativo, y la parsea.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.decideNextReply = decideNextReply;
const gemini_client_1 = require("../lib/gemini-client");
const prompt_1 = require("./prompt");
const SALES_STAGES = [
    "apertura",
    "mini_diagnostico",
    "presentacion_valor",
    "manejo_objeciones",
    "cierre",
    "cerrado_pago",
    "cerrado_rechazo",
];
const OUTPUT_FORMAT_INSTRUCTIONS = `
## Formato de salida — OBLIGATORIO
Responde ÚNICAMENTE con un objeto JSON válido, sin bloques de markdown (sin \`\`\`),
sin texto antes ni después. Estructura exacta:

{
  "reply": "mensaje a enviar al lead ahora mismo",
  "stage": "una de: apertura | mini_diagnostico | presentacion_valor | manejo_objeciones | cierre | cerrado_pago | cerrado_rechazo",
  "captured": {
    "nombre_usuario": "string u omitir si no se sabe",
    "sintoma_inicial": "string u omitir",
    "email": "string u omitir",
    "acepto_o_rechazo_oferta": "pendiente | acepto | rechazo",
    "motivo_rechazo_si_aplica": "string u omitir"
  },
  "send_payment_link": true o false — SOLO true si acepto_o_rechazo_oferta es "acepto" Y captured.email tiene un valor real
}
`.trim();
/**
 * Le pasa el historial reciente + el estado capturado hasta ahora al modelo, y
 * recibe de vuelta la próxima respuesta más el estado actualizado.
 */
async function decideNextReply(history, currentStage, currentCaptured) {
    const contextNote = `Estado actual de esta conversación — etapa: "${currentStage}", ` +
        `datos ya capturados: ${JSON.stringify(currentCaptured)}.`;
    const system = `${prompt_1.SALES_SYSTEM_PROMPT}\n\n${contextNote}\n\n${OUTPUT_FORMAT_INSTRUCTIONS}`;
    const transcript = history.map((m) => `${m.role === "user" ? "Lead" : "Agente"}: ${m.text}`).join("\n");
    const userMessage = `Historial de la conversación (más reciente al final):\n${transcript}\n\nGenera la próxima respuesta.`;
    const raw = await (0, gemini_client_1.callGeminiJson)(system, userMessage, {
        model: process.env.SALES_AGENT_MODEL,
        maxTokens: 700,
    });
    const stage = SALES_STAGES.includes(raw.stage) ? raw.stage : currentStage;
    return {
        reply: String(raw.reply || "").trim(),
        stage,
        captured: Object.assign(Object.assign({}, currentCaptured), (raw.captured || {})),
        sendPaymentLink: Boolean(raw.send_payment_link),
    };
}
//# sourceMappingURL=llm-client.js.map