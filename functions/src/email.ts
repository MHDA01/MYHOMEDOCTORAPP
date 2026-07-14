/**
 * @fileoverview Envío de correos transaccionales (avisos de renovación, confirmaciones de cobro).
 */

import * as nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "465");
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASSWORD = process.env.SMTP_PASSWORD;
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
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

export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<void> {
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
  } catch (error) {
    console.error(`[EMAIL] Error enviando "${subject}" a ${to}:`, error);
  }
}
