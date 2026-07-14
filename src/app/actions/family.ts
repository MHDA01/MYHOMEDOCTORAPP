'use server';

import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { encryptField, decryptField } from '@/lib/crypto';
import { COLECCION_TUTOR, SUBCOLECCION_INTEGRANTES, SUBCOLECCION_HISTORIAL, DOC_HISTORIAL } from '@/lib/constants';
import { validateFamilyMemberData, formatZodErrors, type SaveFamilyMemberInput } from '@/lib/validation-schemas';
import { checkRateLimit } from '@/lib/rate-limit';
import { z } from 'zod';

function safeDecryptFamilyJsonArray(value: unknown): string[] {
  if (typeof value !== 'string' || !value) return [];
  try {
    const decrypted = decryptField(value);
    const parsed = JSON.parse(decrypted);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Crea o actualiza un integrante de la familia con datos cifrados (V#5).
 * @param idToken - Firebase ID token del usuario
 * @param memberId - ID del integrante (null para crear nuevo)
 * @param memberData - Datos del integrante (validados con Zod)
 * @throws Lanza error si validación falla o rate limit es excedido
 */
export async function saveFamilyMember(idToken: string, memberId: string | null, memberData: any) {
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
    let validatedData: SaveFamilyMemberInput;
    try {
      validatedData = validateFamilyMemberData(memberData);
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        const errorMsg = formatZodErrors(validationError);
        console.error('[Family Action] Validation error:', errorMsg);
        return { success: false, error: errorMsg };
      }
      throw validationError;
    }

    const processedData: any = { ...validatedData };

    // Cifrar campos sensibles (PHI)
    if (processedData.allergies && Array.isArray(processedData.allergies)) {
      processedData.encryptedAllergies = encryptField(JSON.stringify(processedData.allergies));
      delete processedData.allergies;
    }

    if (processedData.medications && Array.isArray(processedData.medications)) {
      processedData.encryptedMedications = encryptField(JSON.stringify(processedData.medications));
      delete processedData.medications;
    }

    // Historial médico (ej. pathologicalHistory, surgicalHistory, etc.)
    const historyFields = ['pathologicalHistory', 'surgicalHistory', 'gynecologicalHistory', 'familyHistory'];
    const medicalData: any = { updatedAt: new Date() };
    let hasMedicalData = false;

    historyFields.forEach(field => {
      if (processedData[field as keyof typeof processedData] !== undefined) {
        const value = processedData[field as keyof typeof processedData];
        if (typeof value === 'string' && value.length > 0) {
          medicalData[`encrypted_${field}`] = encryptField(value);
          hasMedicalData = true;
        }
        delete processedData[field as keyof typeof processedData];
      }
    });

    const membersCol = getAdminDb()
      .collection(COLECCION_TUTOR)
      .doc(userId)
      .collection(SUBCOLECCION_INTEGRANTES);

    let finalMemberId = memberId;

    if (!finalMemberId) {
      const docRef = await membersCol.add({
        ...processedData,
        createdAt: new Date(),
        updatedAt: new Date(),
        isEncrypted: true
      });
      finalMemberId = docRef.id;
    } else {
      await membersCol.doc(finalMemberId).set({
        ...processedData,
        updatedAt: new Date(),
        isEncrypted: true
      }, { merge: true });
    }

    if (hasMedicalData) {
      await membersCol
        .doc(finalMemberId)
        .collection(SUBCOLECCION_HISTORIAL)
        .doc(DOC_HISTORIAL)
        .set(medicalData, { merge: true });
    }

    return { success: true, id: finalMemberId };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[Family Action] Error saving member:', errorMsg);
    return { success: false, error: `Failed to save member data: ${errorMsg}` };
  }
}

/**
 * Obtiene todos los integrantes de la familia descifrados (V#5).
 */
export async function getSecureFamilyMembers(idToken: string) {
  try {
    if (!idToken) {
      return [];
    }

    const decodedToken = await getAdminAuth().verifyIdToken(idToken);
    const userId = decodedToken.uid;

    const snap = await getAdminDb()
      .collection(COLECCION_TUTOR)
      .doc(userId)
      .collection(SUBCOLECCION_INTEGRANTES)
      .get();

    const members = snap.docs.map(doc => {
      const data = doc.data() as any;
      const allergies = data.isEncrypted
        ? safeDecryptFamilyJsonArray(data.encryptedAllergies)
        : (Array.isArray(data.allergies) ? data.allergies : []);
      const medications = data.isEncrypted
        ? safeDecryptFamilyJsonArray(data.encryptedMedications)
        : (Array.isArray(data.medications) ? data.medications : []);

      return {
        id: doc.id,
        userId: typeof data.userId === 'string' ? data.userId : userId,
        firstName: typeof data.firstName === 'string' ? data.firstName : '',
        lastName: typeof data.lastName === 'string' ? data.lastName : '',
        sex: typeof data.sex === 'string' ? data.sex : 'other',
        dateOfBirth: typeof data.dateOfBirth === 'string' ? data.dateOfBirth : '',
        age: typeof data.age === 'number' ? data.age : undefined,
        weight: typeof data.weight === 'number' ? data.weight : undefined,
        country: typeof data.country === 'string' ? data.country : undefined,
        insuranceProvider: typeof data.insuranceProvider === 'string' ? data.insuranceProvider : undefined,
        insuranceProviderName: typeof data.insuranceProviderName === 'string' ? data.insuranceProviderName : undefined,
        relationship: typeof data.relationship === 'string' ? data.relationship : 'Integrante',
        esTitular: Boolean(data.esTitular),
        allergies,
        medications,
        hasHistory: Boolean(data.hasHistory),
      };
    });

    return members;
  } catch (error) {
    console.error('[Family Action] Error fetching members:', error);
    return [];
  }
}

/**
 * Obtiene el historial médico descifrado de un integrante (V#5).
 */
export async function getSecureMemberMedicalHistory(idToken: string, memberId: string) {
  try {
    const decodedToken = await getAdminAuth().verifyIdToken(idToken);
    const userId = decodedToken.uid;

    const docSnap = await getAdminDb()
      .collection(COLECCION_TUTOR)
      .doc(userId)
      .collection(SUBCOLECCION_INTEGRANTES)
      .doc(memberId)
      .collection(SUBCOLECCION_HISTORIAL)
      .doc(DOC_HISTORIAL)
      .get();

    if (!docSnap.exists) return null;

    const data = docSnap.data() as any;
    const history: any = { updatedAt: data.updatedAt?.toDate?.() || data.updatedAt };

    const historyFields = ['pathologicalHistory', 'surgicalHistory', 'gynecologicalHistory', 'familyHistory'];
    historyFields.forEach(field => {
      const encField = `encrypted_${field}`;
      if (data[encField]) {
        history[field] = decryptField(data[encField]);
      } else {
        history[field] = data[field] || '';
      }
    });

    return history;
  } catch (error) {
    console.error('[Family Action] Error fetching medical history:', error);
    throw new Error('Failed to fetch secure medical history');
  }
}
