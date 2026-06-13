'use server';

import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { encryptField, decryptField } from '@/lib/crypto';
import { COLECCION_TUTOR, SUBCOLECCION_INTEGRANTES, SUBCOLECCION_HISTORIAL, DOC_HISTORIAL } from '@/lib/constants';

/**
 * Crea o actualiza un integrante de la familia con datos cifrados (V#5).
 */
export async function saveFamilyMember(idToken: string, memberId: string | null, memberData: any) {
  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const userId = decodedToken.uid;

    const processedData = { ...memberData };

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
      if (processedData[field] !== undefined) {
        medicalData[`encrypted_${field}`] = encryptField(processedData[field]);
        delete processedData[field];
        hasMedicalData = true;
      }
    });

    const membersCol = adminDb
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
    console.error('[Family Action] Error saving member:', error);
    return { success: false, error: 'Failed to save member data' };
  }
}

/**
 * Obtiene todos los integrantes de la familia descifrados (V#5).
 */
export async function getSecureFamilyMembers(idToken: string) {
  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const userId = decodedToken.uid;

    const snap = await adminDb
      .collection(COLECCION_TUTOR)
      .doc(userId)
      .collection(SUBCOLECCION_INTEGRANTES)
      .get();

    const members = snap.docs.map(doc => {
      const data = doc.data();
      const member: any = { id: doc.id, ...data };

      if (data.isEncrypted) {
        if (data.encryptedAllergies) {
          member.allergies = JSON.parse(decryptField(data.encryptedAllergies));
        }
        if (data.encryptedMedications) {
          member.medications = JSON.parse(decryptField(data.encryptedMedications));
        }
      }
      return member;
    });

    return members;
  } catch (error) {
    console.error('[Family Action] Error fetching members:', error);
    throw new Error('Failed to fetch secure family members');
  }
}

/**
 * Obtiene el historial médico descifrado de un integrante (V#5).
 */
export async function getSecureMemberMedicalHistory(idToken: string, memberId: string) {
  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const userId = decodedToken.uid;

    const docSnap = await adminDb
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
