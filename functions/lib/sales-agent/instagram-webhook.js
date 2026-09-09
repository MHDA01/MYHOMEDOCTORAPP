"use strict";
/**
 * @fileoverview Webhook de Instagram Messaging API (Meta Graph API) para el agente
 * de ventas. GET = verificación de suscripción, POST = mensajes entrantes → delega
 * en engine.ts. Usa el mismo Meta App que WhatsApp; requiere una cuenta profesional
 * de Instagram vinculada a una Página de Facebook en el Business Manager.
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
exports.instagramWebhook = void 0;
exports.sendInstagramMessage = sendInstagramMessage;
const functions = __importStar(require("firebase-functions/v1"));
const engine_1 = require("./engine");
const IG_VERIFY_TOKEN = process.env.IG_VERIFY_TOKEN || process.env.WHATSAPP_VERIFY_TOKEN;
const IG_PAGE_ACCESS_TOKEN = process.env.IG_PAGE_ACCESS_TOKEN;
const GRAPH_VERSION = "v21.0";
async function sendInstagramMessage(recipientId, text) {
    if (!IG_PAGE_ACCESS_TOKEN) {
        throw new Error("IG_PAGE_ACCESS_TOKEN no configurado en el entorno.");
    }
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/me/messages?access_token=${encodeURIComponent(IG_PAGE_ACCESS_TOKEN)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            recipient: { id: recipientId },
            message: { text },
        }),
    });
    if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Error enviando mensaje de Instagram: ${res.status} ${errBody}`);
    }
}
exports.instagramWebhook = functions.region("us-central1").https.onRequest(async (req, res) => {
    var _a, _b, _c, _d;
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
        const entries = ((_a = req.body) === null || _a === void 0 ? void 0 : _a.entry) || [];
        for (const entry of entries) {
            const events = entry.messaging || [];
            for (const event of events) {
                const from = (_b = event.sender) === null || _b === void 0 ? void 0 : _b.id;
                const text = (_c = event.message) === null || _c === void 0 ? void 0 : _c.text;
                // Ignora ecos de nuestros propios mensajes salientes y mensajes sin texto
                // (stickers, reacciones, adjuntos).
                if (!from || !text || ((_d = event.message) === null || _d === void 0 ? void 0 : _d.is_echo))
                    continue;
                await (0, engine_1.handleInboundMessage)("instagram", from, text, sendInstagramMessage);
            }
        }
        res.status(200).json({ received: true });
    }
    catch (error) {
        console.error("[INSTAGRAM WEBHOOK] Error procesando mensaje entrante:", error);
        res.status(200).json({ received: true, error: true });
    }
});
//# sourceMappingURL=instagram-webhook.js.map