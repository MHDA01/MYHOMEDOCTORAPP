"use strict";
/**
 * @fileoverview Archivo principal de Cloud Functions.
 * Importa y exporta todas las funciones para que Firebase las despliegue.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendDailyHealthTips = exports.chargeMonthlySubscriptions = exports.sendRenewalReminders = exports.cancelAutoRenewal = exports.createPaymentSource = exports.wompyWebhook = exports.initializeWompyPayment = exports.consumeTokenOnConsultationEnd = exports.renewDailyFreeTokens = exports.procesarDocumentoMedico = exports.checkMedicationReminders = exports.checkAppointmentReminders = void 0;
const reminders_1 = require("./reminders");
Object.defineProperty(exports, "checkAppointmentReminders", { enumerable: true, get: function () { return reminders_1.checkAppointmentReminders; } });
Object.defineProperty(exports, "checkMedicationReminders", { enumerable: true, get: function () { return reminders_1.checkMedicationReminders; } });
const idp_1 = require("./idp");
Object.defineProperty(exports, "procesarDocumentoMedico", { enumerable: true, get: function () { return idp_1.procesarDocumentoMedico; } });
const tokens_1 = require("./tokens");
Object.defineProperty(exports, "renewDailyFreeTokens", { enumerable: true, get: function () { return tokens_1.renewDailyFreeTokens; } });
Object.defineProperty(exports, "consumeTokenOnConsultationEnd", { enumerable: true, get: function () { return tokens_1.consumeTokenOnConsultationEnd; } });
const wompy_1 = require("./wompy");
Object.defineProperty(exports, "initializeWompyPayment", { enumerable: true, get: function () { return wompy_1.initializeWompyPayment; } });
Object.defineProperty(exports, "wompyWebhook", { enumerable: true, get: function () { return wompy_1.wompyWebhook; } });
const subscription_1 = require("./subscription");
Object.defineProperty(exports, "createPaymentSource", { enumerable: true, get: function () { return subscription_1.createPaymentSource; } });
Object.defineProperty(exports, "cancelAutoRenewal", { enumerable: true, get: function () { return subscription_1.cancelAutoRenewal; } });
Object.defineProperty(exports, "sendRenewalReminders", { enumerable: true, get: function () { return subscription_1.sendRenewalReminders; } });
Object.defineProperty(exports, "chargeMonthlySubscriptions", { enumerable: true, get: function () { return subscription_1.chargeMonthlySubscriptions; } });
const daily_health_tips_1 = require("./daily-health-tips");
Object.defineProperty(exports, "sendDailyHealthTips", { enumerable: true, get: function () { return daily_health_tips_1.sendDailyHealthTips; } });
//# sourceMappingURL=index.js.map