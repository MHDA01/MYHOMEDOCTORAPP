"use strict";
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
exports.firmaMetaValida = firmaMetaValida;
/**
 * @fileoverview Verificación de la firma de Meta en los webhooks de WhatsApp e
 * Instagram. Sin dependencias de Firebase, para poder probarla.
 *
 * Meta firma cada POST con HMAC-SHA256 del cuerpo **crudo**, usando el App
 * Secret de la aplicación, y lo manda en la cabecera `X-Hub-Signature-256`
 * como `sha256=<hex>`.
 *
 * Sin esto, cualquiera que conozca la URL del webhook puede hacerse pasar por
 * Meta: inventarse un mensaje entrante, hacer que el agente de ventas conteste
 * (cada respuesta es una llamada al modelo, que se paga) y conseguir que la
 * app le mande mensajes de WhatsApp a un número cualquiera.
 *
 * Falla cerrado: si falta el App Secret, no se acepta nada. Es preferible
 * quedarse sin recibir mensajes a aceptar mensajes forjados.
 */
const crypto = __importStar(require("crypto"));
function firmaMetaValida(cuerpo, cabecera, appSecret) {
    if (!appSecret)
        return false;
    if (typeof cabecera !== "string" || !cabecera.startsWith("sha256="))
        return false;
    if (cuerpo === undefined || cuerpo === null)
        return false;
    const recibida = cabecera.slice("sha256=".length).trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(recibida))
        return false;
    const calculada = crypto
        .createHmac("sha256", appSecret)
        .update(typeof cuerpo === "string" ? Buffer.from(cuerpo, "utf8") : cuerpo)
        .digest("hex");
    // Comparación de tiempo constante: una comparación normal filtra, por el
    // tiempo que tarda, cuántos caracteres del principio acertó quien prueba.
    return crypto.timingSafeEqual(Buffer.from(calculada, "hex"), Buffer.from(recibida, "hex"));
}
//# sourceMappingURL=firma-meta.js.map