"use strict";
/**
 * @fileoverview Archivo principal de Cloud Functions.
 * Importa y exporta todas las funciones para que Firebase las despliegue.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.procesarDocumentoMedico = exports.checkMedicationReminders = exports.checkAppointmentReminders = void 0;
const reminders_1 = require("./reminders");
Object.defineProperty(exports, "checkAppointmentReminders", { enumerable: true, get: function () { return reminders_1.checkAppointmentReminders; } });
Object.defineProperty(exports, "checkMedicationReminders", { enumerable: true, get: function () { return reminders_1.checkMedicationReminders; } });
const idp_1 = require("./idp");
Object.defineProperty(exports, "procesarDocumentoMedico", { enumerable: true, get: function () { return idp_1.procesarDocumentoMedico; } });
//# sourceMappingURL=index.js.map