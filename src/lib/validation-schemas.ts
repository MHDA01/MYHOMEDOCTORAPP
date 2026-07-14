/**
 * Zod Schemas para validación de datos clínicos sensibles
 * Aplica validaciones estrictas en server actions
 */

import { z } from 'zod';

/**
 * Schema para datos de alergias
 */
export const AllergySchema = z.object({
  name: z.string().min(1, 'Alergia debe tener nombre').max(200),
  severity: z.enum(['mild', 'moderate', 'severe']).optional(),
  reaction: z.string().max(500).optional(),
});

export type Allergy = z.infer<typeof AllergySchema>;

/**
 * Schema para datos de medicamentos
 */
export const MedicationSchema = z.object({
  name: z.string().min(1, 'Medicamento debe tener nombre').max(200),
  dosage: z.string().max(100).optional(),
  frequency: z.string().max(100).optional(),
  prescriber: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
});

export type Medication = z.infer<typeof MedicationSchema>;

/**
 * Schema para historial médico
 */
export const MedicalHistorySchema = z.object({
  pathologicalHistory: z.string().max(2000, 'Historial patológico muy largo').optional(),
  surgicalHistory: z.string().max(2000, 'Historial quirúrgico muy largo').optional(),
  gynecologicalHistory: z.string().max(2000, 'Historial ginecológico muy largo').optional(),
  familyHistory: z.string().max(2000, 'Historial familiar muy largo').optional(),
});

export type MedicalHistory = z.infer<typeof MedicalHistorySchema>;

/**
 * Schema para datos personales de integrante familiar
 */
export const FamilyMemberPersonalInfoSchema = z.object({
  firstName: z.string().min(1, 'Nombre requerido').max(100),
  lastName: z.string().min(1, 'Apellido requerido').max(100),
  sex: z.enum(['m', 'f', 'other']),
  dateOfBirth: z.string().datetime({ offset: true }).or(z.date()),
  age: z.number().min(0).max(150).optional(),
  weight: z.number().min(0).max(500).optional(),
  country: z.string().max(100).optional(),
  insuranceProvider: z.string().max(50).optional(),
  insuranceProviderName: z.string().max(200).optional(),
  relationship: z.string().max(100).optional(),
  esTitular: z.boolean().default(false),
});

export type FamilyMemberPersonalInfo = z.infer<typeof FamilyMemberPersonalInfoSchema>;

/**
 * Schema completo para guardar integrante familiar
 * (saveFamilyMember)
 */
export const SaveFamilyMemberInputSchema = FamilyMemberPersonalInfoSchema.extend({
  allergies: z.array(z.string()).optional(),
  medications: z.array(z.string()).optional(),
  pathologicalHistory: z.string().max(2000).optional(),
  surgicalHistory: z.string().max(2000).optional(),
  gynecologicalHistory: z.string().max(2000).optional(),
  familyHistory: z.string().max(2000).optional(),
}).strict(); // Reject unknown properties

export type SaveFamilyMemberInput = z.infer<typeof SaveFamilyMemberInputSchema>;

/**
 * Schema para actualizar información de salud del usuario
 * (updateSecureHealthInfo)
 */
export const UpdateHealthInfoInputSchema = z.object({
  allergies: z.array(z.string().max(200)).optional(),
  medications: z.array(z.string().max(200)).optional(),
  pathologicalHistory: z.string().max(2000).optional(),
  surgicalHistory: z.string().max(2000).optional(),
  gynecologicalHistory: z.string().max(2000).optional(),
}).strict();

export type UpdateHealthInfoInput = z.infer<typeof UpdateHealthInfoInputSchema>;

/**
 * Schema para datos personales del usuario
 */
export const UserPersonalInfoSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  sex: z.enum(['m', 'f', 'other']).optional(),
  dateOfBirth: z.string().datetime({ offset: true }).or(z.date()).optional(),
  country: z.string().max(100).optional(),
  insuranceProvider: z.string().max(50).optional(),
  insuranceProviderName: z.string().max(200).optional(),
});

export type UserPersonalInfo = z.infer<typeof UserPersonalInfoSchema>;

/**
 * Helper para validar y parsear datos
 * Lanza ZodError si hay validación fallida
 */
export function validateFamilyMemberData(data: unknown): SaveFamilyMemberInput {
  return SaveFamilyMemberInputSchema.parse(data);
}

export function validateHealthInfo(data: unknown): UpdateHealthInfoInput {
  return UpdateHealthInfoInputSchema.parse(data);
}

/**
 * Helper para formatear errores de validación Zod
 */
export function formatZodErrors(error: z.ZodError): string {
  const issues = error.issues
    .map(issue => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  return `Validation error: ${issues}`;
}
