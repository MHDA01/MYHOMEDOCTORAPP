"use strict";
/**
 * @fileoverview Webhook de Wompi para pagos de leads del agente de ventas (todavía
 * sin cuenta en Cuentas_Tutor). Deliberadamente separado de `wompyWebhook` (pagos de
 * usuarios ya registrados) para no arriesgar el flujo de cobro de producción existente.
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
exports.leadWompiWebhook = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const crypto = __importStar(require("crypto"));
const store_1 = require("./store");
const whatsapp_webhook_1 = require("./whatsapp-webhook");
const instagram_webhook_1 = require("./instagram-webhook");
try {
    admin.initializeApp();
}
catch (_) {
    // Ya inicializado
}
const WOMPY_EVENTS_SECRET = process.env.WOMPY_EVENTS_SECRET;
function verifyWompiSignature(event) {
    var _a, _b;
    if (!WOMPY_EVENTS_SECRET)
        return false;
    const properties = (_a = event === null || event === void 0 ? void 0 : event.signature) === null || _a === void 0 ? void 0 : _a.properties;
    const checksum = (_b = event === null || event === void 0 ? void 0 : event.signature) === null || _b === void 0 ? void 0 : _b.checksum;
    const timestamp = event === null || event === void 0 ? void 0 : event.timestamp;
    if (!Array.isArray(properties) || !properties.length || !checksum || !timestamp) {
        return false;
    }
    const values = properties.map((path) => path.split(".").reduce((obj, key) => obj === null || obj === void 0 ? void 0 : obj[key], event.data));
    const concatenated = values.join("") + timestamp + WOMPY_EVENTS_SECRET;
    const computed = crypto.createHash("sha256").update(concatenated).digest("hex");
    return computed.toLowerCase() === String(checksum).toLowerCase();
}
exports.leadWompiWebhook = functions.region("us-central1").https.onRequest(async (req, res) => {
    var _a, _b;
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
        const transaction = (_a = event.data) === null || _a === void 0 ? void 0 : _a.transaction;
        const wompyId = transaction === null || transaction === void 0 ? void 0 : transaction.id;
        const status = transaction === null || transaction === void 0 ? void 0 : transaction.status; // APPROVED | DECLINED | VOIDED | ERROR
        const reference = (transaction === null || transaction === void 0 ? void 0 : transaction.reference) || "";
        if (!wompyId || !reference.startsWith("lead_")) {
            // No es un pago generado por el agente de ventas (probablemente le corresponde
            // a wompyWebhook) — se ignora aquí.
            res.status(200).json({ received: true, ignored: true });
            return;
        }
        const parts = reference.split("_");
        const channel = parts[1];
        const externalId = parts[2];
        if (!channel || !externalId) {
            console.error("[LEAD PAYMENT WEBHOOK] No se pudo extraer channel/externalId del reference:", reference);
            res.status(400).json({ error: "Reference inválido" });
            return;
        }
        const ref = (0, store_1.leadRef)(channel, externalId);
        const leadSnap = await ref.get();
        if (!leadSnap.exists) {
            console.error(`[LEAD PAYMENT WEBHOOK] Lead no encontrado: ${channel}_${externalId}`);
            res.status(404).json({ error: "Lead no encontrado" });
            return;
        }
        const txSnap = await ref.collection("transactions").where("wompy_id", "==", wompyId).limit(1).get();
        if (!txSnap.empty) {
            const existingStatus = (_b = txSnap.docs[0].data()) === null || _b === void 0 ? void 0 : _b.status;
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
            const confirmMessage = "¡Listo! Tu pago fue aprobado. Ya tienes tu suscripción a My Home Doctor activa a precio fundador. " +
                "Para terminar de activar tu cuenta, descarga la app y regístrate con este mismo correo — te llegará " +
                "la confirmación en unos minutos.";
            try {
                if (channel === "whatsapp") {
                    await (0, whatsapp_webhook_1.sendWhatsAppMessage)(externalId, confirmMessage);
                }
                else {
                    await (0, instagram_webhook_1.sendInstagramMessage)(externalId, confirmMessage);
                }
            }
            catch (sendError) {
                console.error(`[LEAD PAYMENT WEBHOOK] Pago aprobado pero falló el envío de confirmación a ${channel}_${externalId}:`, sendError);
            }
            console.log(`[LEAD PAYMENT WEBHOOK] Lead convertido: ${channel}_${externalId}`);
        }
        else {
            console.log(`[LEAD PAYMENT WEBHOOK] Pago de lead no aprobado (${status}): ${channel}_${externalId}`);
        }
        res.status(200).json({ received: true });
    }
    catch (error) {
        console.error("[LEAD PAYMENT WEBHOOK] Error:", error);
        res.status(500).json({ error: "Error procesando webhook" });
    }
});
//# sourceMappingURL=lead-payment-webhook.js.map