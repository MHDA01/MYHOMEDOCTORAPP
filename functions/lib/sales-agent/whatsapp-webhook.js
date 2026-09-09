"use strict";
/**
 * @fileoverview Webhook de WhatsApp Cloud API (directo con Meta, sin intermediario)
 * para el agente de ventas. GET = verificación de suscripción, POST = mensajes
 * entrantes → delega en engine.ts.
 *
 * Requiere en Meta for Developers: número de WhatsApp registrado en el Cloud API,
 * y este endpoint desplegado configurado como Callback URL del webhook de la app.
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
exports.whatsappWebhook = void 0;
exports.sendWhatsAppMessage = sendWhatsAppMessage;
const functions = __importStar(require("firebase-functions/v1"));
const engine_1 = require("./engine");
const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const GRAPH_VERSION = "v21.0";
async function sendWhatsAppMessage(to, text) {
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
exports.whatsappWebhook = functions.region("us-central1").https.onRequest(async (req, res) => {
    var _a, _b, _c;
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
        const entries = ((_a = req.body) === null || _a === void 0 ? void 0 : _a.entry) || [];
        for (const entry of entries) {
            const changes = entry.changes || [];
            for (const change of changes) {
                const messages = ((_b = change.value) === null || _b === void 0 ? void 0 : _b.messages) || [];
                for (const message of messages) {
                    const from = message.from;
                    const text = (_c = message.text) === null || _c === void 0 ? void 0 : _c.body;
                    if (!from || !text)
                        continue;
                    await (0, engine_1.handleInboundMessage)("whatsapp", from, text, sendWhatsAppMessage);
                }
            }
        }
        res.status(200).json({ received: true });
    }
    catch (error) {
        console.error("[WHATSAPP WEBHOOK] Error procesando mensaje entrante:", error);
        // Igual respondemos 200: Meta reintenta agresivamente sin un 200, y el reintento
        // no resolvería un error de lógica interna.
        res.status(200).json({ received: true, error: true });
    }
});
//# sourceMappingURL=whatsapp-webhook.js.map