/**
 * @fileoverview Archivo principal de Cloud Functions.
 * Importa y exporta las funciones programadas para que Firebase las despliegue.
 * Mantiene este archivo limpio y delega la lógica a otros módulos.
 */

// Importa las funciones de recordatorios desde su propio módulo.
import { checkAppointmentReminders, checkMedicationReminders } from "./reminders";

// Exporta las funciones para que Firebase las reconozca y las despliegue.
export { checkAppointmentReminders, checkMedicationReminders };
