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
import { sendDailyHealthTips, generateDailyTipNow } from "./daily-health-tips";
import { generateWeeklyContentPlan, generateContentPlanNow } from "./content-agent";
import { protocolosRedactarBorrador, protocolosVerificarBorrador } from "./protocolos";

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
  generateDailyTipNow,
  // El agente de ventas por WhatsApp e Instagram se eliminó el 20-oct-2026 por
  // decisión del fundador: la app no se conecta a plataformas de terceros
  // fuera de Firebase. Con él se fueron whatsappWebhook, instagramWebhook,
  // leadWompiWebhook, manualAgentReply y manualAgentConsole. Estas funciones
  // siguen existiendo en producción hasta que se despliegue `functions`.
  // Agente de contenido semanal (borradores por correo, no publica solo)
  generateWeeklyContentPlan,
  generateContentPlanNow,
  // Agente de protocolos: borradores desde la biblioteca cerrada, para revisión médica
  protocolosRedactarBorrador,
  protocolosVerificarBorrador,
};
