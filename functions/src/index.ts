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
};
