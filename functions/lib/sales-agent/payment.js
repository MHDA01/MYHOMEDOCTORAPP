"use strict";
/**
 * @fileoverview Generación de link de pago Wompi para leads del agente de ventas
 * (todavía sin cuenta en Cuentas_Tutor). Reutiliza el cliente HTTP de Wompi existente
 * (`wompi-client.ts`) sin tocar el flujo de pago de usuarios ya registrados.
 *
 * El `reference` sigue el formato `lead_{channel}_{externalId}_{timestamp}` — como
 * channel y externalId (teléfono / IGSID) nunca traen guion bajo, `leadWompiWebhook`
 * lo puede partir de vuelta de forma confiable.
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
exports.createLeadPaymentLink = createLeadPaymentLink;
const admin = __importStar(require("firebase-admin"));
const wompi_client_1 = require("../wompi-client");
const store_1 = require("./store");
const prompt_1 = require("./prompt");
const REDIRECT_URL = process.env.SALES_AGENT_REDIRECT_URL || "https://myhomedoctorapp.com/dashboard/teleorientacion";
async function createLeadPaymentLink(channel, externalId, email, nombre) {
    var _a;
    const reference = `lead_${channel}_${externalId}_${Date.now()}`;
    const wompyPayload = {
        name: "Suscripción Fundador My Home Doctor",
        description: `Plan Teleorientación Mensual - Precio Fundador ($${prompt_1.FOUNDER_PRICE_COP.toLocaleString("es-CO")} COP)`,
        single_use: true,
        collect_shipping: false,
        currency: "COP",
        amount_in_cents: prompt_1.FOUNDER_PRICE_COP * 100,
        redirect_url: REDIRECT_URL,
    };
    const wompyResponse = await (0, wompi_client_1.wompiRequest)("POST", "/v1/payment_links", wompyPayload);
    const wompyId = (_a = wompyResponse === null || wompyResponse === void 0 ? void 0 : wompyResponse.data) === null || _a === void 0 ? void 0 : _a.id;
    if (!wompyId) {
        throw new Error(`Respuesta inesperada de Wompi al crear link de lead: ${JSON.stringify(wompyResponse)}`);
    }
    const paymentUrl = `https://checkout.wompi.co/l/${wompyId}`;
    const ref = (0, store_1.leadRef)(channel, externalId);
    await ref.update({
        paymentReference: reference,
        email,
        stage: "cierre",
    });
    await ref.collection("transactions").add({
        wompy_id: wompyId,
        amount: prompt_1.FOUNDER_PRICE_COP,
        status: "pending",
        reference,
        payment_url: paymentUrl,
        customer_email: email,
        customer_name: nombre || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return paymentUrl;
}
//# sourceMappingURL=payment.js.map