'use server';

import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { encryptField, decryptField } from '@/lib/crypto';
import { COLECCION_TUTOR } from '@/lib/constants';
import { validateHealthInfo, formatZodErrors, type UpdateHealthInfoInput } from '@/lib/validation-schemas';
import { checkRateLimit } from '@/lib/rate-limit';
import { z } from 'zod';

function safeDecryptJsonArray(value: unknown): string[] {
  if (typeof value !== 'string' || !value) return [];
  try {
    const decrypted = decryptField(value);
    const parsed = JSON.parse(decrypted);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeDateValue(value: any): string {
  if (!value) return new Date().toISOString();
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

/**
 * Obtiene el documento del usuario con datos descifrados (V#5).
 */
export async function getSecureUserDocument(idToken: string) {
  try {
    const decodedToken = await getAdminAuth().verifyIdToken(idToken);
    const userId = decodedToken.uid;

    const docSnap = await getAdminDb().collection(COLECCION_TUTOR).doc(userId).get();
    if (!docSnap.exists) return null;

    const data = docSnap.data() as any;
    const rawHealthInfo = data.healthInfo || {};
    const healthInfo: any = { ...rawHealthInfo };

    if (data.isEncrypted || rawHealthInfo.isEncrypted) {
      healthInfo.allergies = safeDecryptJsonArray(rawHealthInfo.encryptedAllergies);
      healthInfo.medications = safeDecryptJsonArray(rawHealthInfo.encryptedMedications);

      const historyFields = ['pathologicalHistory', 'surgicalHistory', 'gynecologicalHistory'];
      historyFields.forEach(field => {
        const encField = `encrypted_${field}`;
        const encryptedValue = rawHealthInfo[encField];
        healthInfo[field] = typeof encryptedValue === 'string' && encryptedValue
          ? decryptField(encryptedValue)
          : (rawHealthInfo[field] || '');
      });

      delete healthInfo.encryptedAllergies;
      delete healthInfo.encryptedMedications;
      delete healthInfo.encrypted_pathologicalHistory;
      delete healthInfo.encrypted_surgicalHistory;
      delete healthInfo.encrypted_gynecologicalHistory;
    } else {
      healthInfo.allergies = Array.isArray(rawHealthInfo.allergies) ? rawHealthInfo.allergies : [];
      healthInfo.medications = Array.isArray(rawHealthInfo.medications) ? rawHealthInfo.medications : [];
      healthInfo.pathologicalHistory = rawHealthInfo.pathologicalHistory || '';
      healthInfo.surgicalHistory = rawHealthInfo.surgicalHistory || '';
      healthInfo.gynecologicalHistory = rawHealthInfo.gynecologicalHistory || '';
    }

    const rawPersonalInfo = data.personalInfo || {};
    const personalInfo = {
      firstName: rawPersonalInfo.firstName || 'Nuevo',
      lastName: rawPersonalInfo.lastName || 'Usuario',
      sex: rawPersonalInfo.sex || 'other',
      dateOfBirth: normalizeDateValue(rawPersonalInfo.dateOfBirth),
      country: rawPersonalInfo.country || 'colombia',
      insuranceProvider: rawPersonalInfo.insuranceProvider || '',
      insuranceProviderName: rawPersonalInfo.insuranceProviderName || '',
    };

    return {
      personalInfo,
      healthInfo,
    };
  } catch (error) {
    console.error('[User Action] Error getting secure user doc:', error);
    throw new Error('Failed to retrieve secure data');
  }
}

/**
 * Actualiza la información de salud de forma cifrada (V#5).
 * @param idToken - Firebase ID token del usuario
 * @param healthInfo - Datos de salud (validados con Zod)
 * @throws Lanza error si validación falla o rate limit es excedido
 */
export async function updateSecureHealthInfo(idToken: string, healthInfo: any) {
  try {
    const decodedToken = await getAdminAuth().verifyIdToken(idToken);
    const userId = decodedToken.uid;

    // ✅ Rate limiting: máx 10 requests por minuto por usuario
    checkRateLimit(
      { userId },
      {
        limit: 10,
        window: 60,
        keys: ['userId'],
      }
    );

    // ✅ Validar datos de entrada con Zod
    let validatedHealthInfo: UpdateHealthInfoInput;
    try {
      validatedHealthInfo = validateHealthInfo(healthInfo);
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        const errorMsg = formatZodErrors(validationError);
        console.error('[User Action] Validation error:', errorMsg);
        return { success: false, error: errorMsg };
      }
      throw validationError;
    }

    const encryptedHealthInfo = {
      ...validatedHealthInfo,
      isEncrypted: true,
      encryptedAllergies: encryptField(JSON.stringify(validatedHealthInfo.allergies || [])),
      encryptedMedications: encryptField(JSON.stringify(validatedHealthInfo.medications || [])),
      encrypted_pathologicalHistory: encryptField(validatedHealthInfo.pathologicalHistory || ''),
      encrypted_surgicalHistory: encryptField(validatedHealthInfo.surgicalHistory || ''),
      encrypted_gynecologicalHistory: encryptField(validatedHealthInfo.gynecologicalHistory || ''),
    };

    
    delete encryptedHealthInfo.allergies;
    delete encryptedHealthInfo.medications;
    delete encryptedHealthInfo.pathologicalHistory;
    delete encryptedHealthInfo.surgicalHistory;
    delete encryptedHealthInfo.gynecologicalHistory;

    await getAdminDb().collection(COLECCION_TUTOR).doc(userId).update({
      healthInfo: encryptedHealthInfo,
      updatedAt: new Date(),
    });

    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[User Action] Error updating health info:', errorMsg);
    return { success: false, error: 'Failed to update encrypted data' };
  }
}
