"use strict";
/**
 * @fileoverview Envío de correos transaccionales (avisos de renovación, confirmaciones de cobro).
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
exports.sendEmail = sendEmail;
const nodemailer = __importStar(require("nodemailer"));
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "465");
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASSWORD = process.env.SMTP_PASSWORD;
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;
let transporter = null;
function getTransporter() {
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) {
        console.warn("[EMAIL] SMTP no configurado (faltan variables de entorno)");
        return null;
    }
    if (!transporter) {
        transporter = nodemailer.createTransport({
            host: SMTP_HOST,
            port: SMTP_PORT,
            secure: SMTP_PORT === 465,
            auth: {
                user: SMTP_USER,
                pass: SMTP_PASSWORD,
            },
        });
    }
    return transporter;
}
async function sendEmail(to, subject, html) {
    const t = getTransporter();
    if (!t) {
        console.error(`[EMAIL] No se pudo enviar "${subject}" a ${to}: SMTP no configurado`);
        return;
    }
    try {
        await t.sendMail({
            from: SMTP_FROM,
            to,
            subject,
            html,
        });
        console.log(`[EMAIL] Enviado "${subject}" a ${to}`);
    }
    catch (error) {
        console.error(`[EMAIL] Error enviando "${subject}" a ${to}:`, error);
    }
}
//# sourceMappingURL=email.js.map