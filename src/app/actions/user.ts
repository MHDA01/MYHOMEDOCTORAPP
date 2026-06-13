'use server';

import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { encryptField, decryptField } from '@/lib/crypto';
import { COLECCION_TUTOR } from '@/lib/constants';

/**
 * Obtiene el documento del usuario con datos descifrados (V#5).
 */
export async function getSecureUserDocument(idToken: string) {
  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const userId = decodedToken.uid;

    const docSnap = await adminDb.collection(COLECCION_TUTOR).doc(userId).get();
    if (!docSnap.exists) return null;

    const data = docSnap.data() as any;
    const healthInfo = data.healthInfo || {};

    
    if (data.isEncrypted || healthInfo.isEncrypted) {
      if (healthInfo.encryptedAllergies) {
        healthInfo.allergies = JSON.parse(decryptField(healthInfo.encryptedAllergies));
        delete healthInfo.encryptedAllergies;
      }
      if (healthInfo.encryptedMedications) {
        healthInfo.medications = JSON.parse(decryptField(healthInfo.encryptedMedications));
        delete healthInfo.encryptedMedications;
      }
      
      const historyFields = ['pathologicalHistory', 'surgicalHistory', 'gynecologicalHistory'];
      historyFields.forEach(field => {
        const encField = `encrypted_${field}`;
        if (healthInfo[encField]) {
          healthInfo[field] = decryptField(healthInfo[encField]);
          delete healthInfo[encField];
        }
      });
    }

    return {
      personalInfo: data.personalInfo,
      healthInfo: healthInfo,
    };
  } catch (error) {
    console.error('[User Action] Error getting secure user doc:', error);
    throw new Error('Failed to retrieve secure data');
  }
}

/**
 * Actualiza la información de salud de forma cifrada (V#5).
 */
export async function updateSecureHealthInfo(idToken: string, healthInfo: any) {
  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const userId = decodedToken.uid;

    const encryptedHealthInfo = {
      ...healthInfo,
      isEncrypted: true,
      encryptedAllergies: encryptField(JSON.stringify(healthInfo.allergies || [])),
      encryptedMedications: encryptField(JSON.stringify(healthInfo.medications || [])),
      encrypted_pathologicalHistory: encryptField(healthInfo.pathologicalHistory || ''),
      encrypted_surgicalHistory: encryptField(healthInfo.surgicalHistory || ''),
      encrypted_gynecologicalHistory: encryptField(healthInfo.gynecologicalHistory || ''),
    };

    
    delete encryptedHealthInfo.allergies;
    delete encryptedHealthInfo.medications;
    delete encryptedHealthInfo.pathologicalHistory;
    delete encryptedHealthInfo.surgicalHistory;
    delete encryptedHealthInfo.gynecologicalHistory;

    await adminDb.collection(COLECCION_TUTOR).doc(userId).update({
      healthInfo: encryptedHealthInfo,
      updatedAt: new Date(),
    });

    return { success: true };
  } catch (error) {
    console.error('[User Action] Error updating health info:', error);
    return { success: false, error: 'Failed to update encrypted data' };
  }
}
