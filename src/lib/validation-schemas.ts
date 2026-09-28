/**
 * Zod Schemas para validación de datos clínicos sensibles
 * Aplica validaciones estrictas en server actions
 */

import { z } from 'zod';
import { normalizarFechaNacimiento, normalizarSexo } from '@/lib/familia';

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
 * Sexo: el servidor aceptaba 'm'/'f' y la app usa 'male'/'female'; se aceptan los
 * dos y se guarda siempre 'male' | 'female' | 'other'.
 */
const SexoSchema = z
  .enum(['m', 'f', 'male', 'female', 'other'], { errorMap: () => ({ message: 'Sexo no válido' }) })
  .transform(normalizarSexo);

/**
 * Fecha de nacimiento: acepta 'AAAA-MM-DD' (lo que entrega el campo de fecha),
 * fecha ISO con hora o Date, y se guarda como 'AAAA-MM-DD'.
 */
const FechaNacimientoSchema = z
  .union([z.string(), z.date()])
  .transform((valor, ctx) => {
    const fecha = normalizarFechaNacimiento(valor);
    if (!fecha) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Fecha de nacimiento no válida' });
      return z.NEVER;
    }
    if (fecha < '1900-01-01' || fecha > new Date().toISOString().slice(0, 10)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'La fecha de nacimiento debe estar entre 1900 y hoy' });
      return z.NEVER;
    }
    return fecha;
  });

/** Lista de textos cortos (alergias, medicamentos). */
const ListaCortaSchema = z.array(z.string().trim().min(1).max(200)).max(50);

/**
 * Schema para datos personales de integrante familiar
 */
export const FamilyMemberPersonalInfoSchema = z.object({
  firstName: z.string().trim().min(1, 'Nombre requerido').max(100),
  lastName: z.string().trim().min(1, 'Apellido requerido').max(100),
  sex: SexoSchema,
  dateOfBirth: FechaNacimientoSchema,
  age: z.number().min(0).max(150).optional(),
  weight: z.number().min(0).max(500).optional(),
  country: z.string().max(100).optional(),
  insuranceProvider: z.string().max(50).optional(),
  insuranceProviderName: z.string().max(200).optional(),
  relationship: z.string().trim().max(100).optional(),
  esTitular: z.boolean().default(false),
  /** Para el familiograma: la persona ya falleció (se dibuja tachada). */
  deceased: z.boolean().optional(),
});

export type FamilyMemberPersonalInfo = z.infer<typeof FamilyMemberPersonalInfoSchema>;

/**
 * Schema completo para guardar integrante familiar
 * (saveFamilyMember)
 */
export const SaveFamilyMemberInputSchema = FamilyMemberPersonalInfoSchema.extend({
  allergies: ListaCortaSchema.optional(),
  medications: ListaCortaSchema.optional(),
  pathologicalHistory: z.string().max(2000).optional(),
  surgicalHistory: z.string().max(2000).optional(),
  gynecologicalHistory: z.string().max(2000).optional(),
  familyHistory: z.string().max(2000).optional(),
}).strict(); // Reject unknown properties

export type SaveFamilyMemberInput = z.infer<typeof SaveFamilyMemberInputSchema>;

/**
 * Schema para guardar el perfil del titular (la cuenta). Vive en el documento de la
 * cuenta, no en Integrantes: no lleva parentesco, y `sex`/`dateOfBirth` se validan igual.
 */
export const SaveTitularProfileInputSchema = z.object({
  firstName: z.string().trim().min(1, 'Nombre requerido').max(100),
  lastName: z.string().trim().min(1, 'Apellido requerido').max(100),
  sex: SexoSchema,
  dateOfBirth: FechaNacimientoSchema,
  weight: z.number().min(0).max(500).optional(),
  country: z.enum(['chile', 'argentina', 'colombia']).optional(),
  insuranceProvider: z.string().max(50).optional(),
  insuranceProviderName: z.string().max(200).optional(),
  allergies: ListaCortaSchema.optional(),
  medications: ListaCortaSchema.optional(),
  pathologicalHistory: z.string().max(2000).optional(),
  surgicalHistory: z.string().max(2000).optional(),
  gynecologicalHistory: z.string().max(2000).optional(),
}).strict();

export type SaveTitularProfileInput = z.infer<typeof SaveTitularProfileInputSchema>;

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

export function validateTitularProfile(data: unknown): SaveTitularProfileInput {
  return SaveTitularProfileInputSchema.parse(data);
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
