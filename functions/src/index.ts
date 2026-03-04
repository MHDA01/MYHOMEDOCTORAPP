/**
 * @fileoverview Archivo principal de Cloud Functions.
 * Importa y exporta todas las funciones para que Firebase las despliegue.
 */

import { checkAppointmentReminders, checkMedicationReminders } from "./reminders";
import { procesarDocumentoMedico } from "./idp";

export { checkAppointmentReminders, checkMedicationReminders, procesarDocumentoMedico };
