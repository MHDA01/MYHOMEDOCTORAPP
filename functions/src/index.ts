/**
 * @fileoverview Archivo principal de Cloud Functions.
 * Importa y exporta todas las funciones para que Firebase las despliegue.
 */

import { checkAppointmentReminders, checkMedicationReminders } from "./reminders";
import { procesarDocumentoMedico } from "./idp";
import { renewDailyFreeTokens, consumeTokenOnConsultationEnd } from "./tokens";
import { initializeWompyPayment, wompyWebhook } from "./wompy";
import {
  createPaymentSource,
  cancelAutoRenewal,
  sendRenewalReminders,
  chargeMonthlySubscriptions,
} from "./subscription";
import { sendDailyHealthTips } from "./daily-health-tips";
import { whatsappWebhook } from "./sales-agent/whatsapp-webhook";
import { instagramWebhook } from "./sales-agent/instagram-webhook";
import { leadWompiWebhook } from "./sales-agent/lead-payment-webhook";
import { manualAgentReply, manualAgentConsole } from "./sales-agent/manual-console";
import { generateWeeklyContentPlan, generateContentPlanNow } from "./content-agent";

export {
  // Reminders
  checkAppointmentReminders,
  checkMedicationReminders,
  // Document Processing
  procesarDocumentoMedico,
  // Tokens
  renewDailyFreeTokens,
  consumeTokenOnConsultationEnd,
  // Payment Gateway (Wompy)
  initializeWompyPayment,
  wompyWebhook,
  // Subscription Billing (renovación automática mensual)
  createPaymentSource,
  cancelAutoRenewal,
  sendRenewalReminders,
  chargeMonthlySubscriptions,
  // Consejos de salud diarios personalizados
  sendDailyHealthTips,
  // Agente de ventas conversacional (WhatsApp + Instagram)
  whatsappWebhook,
  instagramWebhook,
  leadWompiWebhook,
  // Consola manual (mientras Meta sigue bloqueado)
  manualAgentReply,
  manualAgentConsole,
  // Agente de contenido semanal (borradores por correo, no publica solo)
  generateWeeklyContentPlan,
  generateContentPlanNow,
};
