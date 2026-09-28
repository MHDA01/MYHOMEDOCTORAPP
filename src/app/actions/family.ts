'use server';

import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb, getAdminStorage } from '@/lib/firebase-admin';
import { encryptField, decryptField } from '@/lib/crypto';
import {
  COLECCION_TUTOR,
  SUBCOLECCION_INTEGRANTES,
  SUBCOLECCION_HISTORIAL,
  SUBCOLECCION_CONVERSACIONES,
  DOC_HISTORIAL,
} from '@/lib/constants';
import {
  validateFamilyMemberData,
  validateTitularProfile,
  formatZodErrors,
  type SaveFamilyMemberInput,
  type SaveTitularProfileInput,
} from '@/lib/validation-schemas';
import { checkRateLimit } from '@/lib/rate-limit';
import { calcularEdad, normalizarFechaNacimiento, normalizarSexo } from '@/lib/familia';
import { camposSaludCifrada, descifrarLista, descifrarSaludTitular } from '@/lib/salud-cifrada';
import type { FamilyProfile } from '@/lib/types';
import { z } from 'zod';

/** Id que se le da al titular cuando no tiene documento propio en Integrantes. */
const ID_TITULAR = 'titular';

const CAMPOS_HISTORIAL = ['pathologicalHistory', 'surgicalHistory', 'gynecologicalHistory', 'familyHistory'] as const;

const esTitularGuardado = (data: any) => Boolean(data?.esTitular) || data?.relationship === 'Titular';

/** Lista cifrada; si el dato viejo quedó en claro (antes del cifrado) se conserva. */
function leerLista(data: any, cifrado: string, claro: string): string[] {
  if (typeof data[cifrado] === 'string' && data[cifrado]) return descifrarLista(data[cifrado]);
  return Array.isArray(data[claro]) ? data[claro].filter((x: unknown) => typeof x === 'string') : [];
}

function fechaGuardada(valor: any): string {
  if (typeof valor?.toDate === 'function') return valor.toDate().toISOString().slice(0, 10);
  return normalizarFechaNacimiento(valor) ?? '';
}

/** Historial en claro de un documento `historial/registro` (cifrado o, si es antiguo, en claro). */
function leerHistorial(data: any): Record<(typeof CAMPOS_HISTORIAL)[number], string> {
  const salida: any = {};
  for (const campo of CAMPOS_HISTORIAL) {
    const cifrado = data?.[`encrypted_${campo}`];
    salida[campo] = typeof cifrado === 'string' && cifrado ? decryptField(cifrado) : data?.[campo] || '';
  }
  return salida;
}

function tieneHistorial(h: Record<string, string>): boolean {
  return CAMPOS_HISTORIAL.some((campo) => Boolean(h[campo]));
}

/**
 * Lee a toda la familia de la cuenta. El titular siempre viene primero y sale del
 * documento de la cuenta (fuente de verdad); si hay un integrante antiguo marcado
 * como titular, se usa solo su id y su peso, y no se duplica.
 */
async function leerFamilia(userId: string, conHistorial: boolean): Promise<FamilyProfile[]> {
  const db = getAdminDb();
  const cuentaRef = db.collection(COLECCION_TUTOR).doc(userId);
  const [cuentaSnap, integrantesSnap] = await Promise.all([
    cuentaRef.get(),
    cuentaRef.collection(SUBCOLECCION_INTEGRANTES).get(),
  ]);

  const historiales = new Map<string, Record<string, string>>();
  if (conHistorial && !integrantesSnap.empty) {
    const refs = integrantesSnap.docs.map((d) => d.ref.collection(SUBCOLECCION_HISTORIAL).doc(DOC_HISTORIAL));
    const snaps = await db.getAll(...refs);
    snaps.forEach((snap, i) => {
      if (snap.exists) historiales.set(integrantesSnap.docs[i].id, leerHistorial(snap.data()));
    });
  }

  const otros: FamilyProfile[] = [];
  let titularAntiguo: FirebaseFirestore.QueryDocumentSnapshot | null = null;

  for (const doc of integrantesSnap.docs) {
    const data = doc.data() as any;
    if (esTitularGuardado(data)) {
      titularAntiguo = doc;
      continue;
    }
    const historial = historiales.get(doc.id);
    const fechaNacimiento = fechaGuardada(data.dateOfBirth);
    otros.push({
      id: doc.id,
      userId,
      firstName: typeof data.firstName === 'string' ? data.firstName : '',
      lastName: typeof data.lastName === 'string' ? data.lastName : '',
      sex: normalizarSexo(data.sex),
      dateOfBirth: fechaNacimiento,
      age: calcularEdad(fechaNacimiento) ?? (typeof data.age === 'number' ? data.age : undefined),
      weight: typeof data.weight === 'number' ? data.weight : undefined,
      country: typeof data.country === 'string' ? (data.country as FamilyProfile['country']) : undefined,
      insuranceProvider: typeof data.insuranceProvider === 'string' ? data.insuranceProvider : undefined,
      insuranceProviderName: typeof data.insuranceProviderName === 'string' ? data.insuranceProviderName : undefined,
      relationship: typeof data.relationship === 'string' && data.relationship ? data.relationship : 'Integrante',
      esTitular: false,
      deceased: Boolean(data.deceased),
      allergies: leerLista(data, 'encryptedAllergies', 'allergies'),
      medications: leerLista(data, 'encryptedMedications', 'medications'),
      hasHistory: historial ? tieneHistorial(historial) : Boolean(data.hasHistory),
      ...(conHistorial ? { ...leerHistorial({}), ...historial } : {}),
    });
  }

  otros.sort((a, b) => (a.firstName || '').localeCompare(b.firstName || '', 'es'));

  if (!cuentaSnap.exists) return otros;

  const cuenta = cuentaSnap.data() as any;
  const personal = cuenta.personalInfo || {};
  const salud = descifrarSaludTitular(cuenta);
  const antiguo = titularAntiguo?.data() as any;
  const fechaNacimiento = fechaGuardada(personal.dateOfBirth);
  const historialTitular = {
    pathologicalHistory: salud.pathologicalHistory || '',
    surgicalHistory: salud.surgicalHistory || '',
    gynecologicalHistory: salud.gynecologicalHistory || '',
  };

  const titular: FamilyProfile = {
    id: titularAntiguo?.id ?? ID_TITULAR,
    userId,
    firstName: personal.firstName || '',
    lastName: personal.lastName || '',
    sex: normalizarSexo(personal.sex),
    dateOfBirth: fechaNacimiento,
    age: calcularEdad(fechaNacimiento),
    weight: typeof personal.weight === 'number' ? personal.weight : typeof antiguo?.weight === 'number' ? antiguo.weight : undefined,
    country: typeof personal.country === 'string' ? personal.country : undefined,
    insuranceProvider: personal.insuranceProvider || undefined,
    insuranceProviderName: personal.insuranceProviderName || undefined,
    relationship: 'Titular',
    esTitular: true,
    allergies: salud.allergies,
    medications: salud.medications,
    hasHistory: tieneHistorial(historialTitular),
    ...(conHistorial ? { ...historialTitular, familyHistory: '' } : {}),
  };

  return [titular, ...otros];
}

/**
 * Crea o actualiza un integrante de la familia con datos cifrados (V#5).
 * El titular no se guarda aquí: vive en el documento de la cuenta (saveTitularProfile).
 * @param idToken - Firebase ID token del usuario
 * @param memberId - ID del integrante (null para crear nuevo)
 * @param memberData - Datos del integrante (validados con Zod)
 */
export async function saveFamilyMember(idToken: string, memberId: string | null, memberData: any) {
  try {
    const decodedToken = await getAdminAuth().verifyIdToken(idToken);
    const userId = decodedToken.uid;

    // ✅ Rate limiting: máx 10 requests por minuto por usuario
    checkRateLimit({ userId }, { limit: 10, window: 60, keys: ['userId'] });

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

    if (validatedData.esTitular || validatedData.relationship === 'Titular') {
      return { success: false, error: 'El titular es la cuenta: se edita con su propio perfil, no como integrante.' };
    }
    if (memberId !== null && (typeof memberId !== 'string' || !memberId || memberId.includes('/') || memberId === ID_TITULAR)) {
      return { success: false, error: 'Integrante no válido.' };
    }

    const membersCol = getAdminDb().collection(COLECCION_TUTOR).doc(userId).collection(SUBCOLECCION_INTEGRANTES);
    const memberRef = memberId ? membersCol.doc(memberId) : membersCol.doc();

    if (memberId) {
      const existente = await memberRef.get();
      if (!existente.exists) return { success: false, error: 'Ese integrante no existe.' };
      if (esTitularGuardado(existente.data())) {
        return { success: false, error: 'El titular es la cuenta: se edita con su propio perfil.' };
      }
    }

    const { allergies, medications, ...resto } = validatedData;
    const datos: Record<string, unknown> = {};
    const historialCampos: Record<string, string> = {};
    for (const [clave, valor] of Object.entries(resto)) {
      if (valor === undefined) continue;
      if ((CAMPOS_HISTORIAL as readonly string[]).includes(clave)) historialCampos[clave] = valor as string;
      else datos[clave] = valor;
    }

    // Cifrar campos sensibles (PHI). Si antes estaban en claro, se borra esa copia.
    if (allergies) {
      datos.encryptedAllergies = encryptField(JSON.stringify(allergies));
      datos.allergies = FieldValue.delete();
    }
    if (medications) {
      datos.encryptedMedications = encryptField(JSON.stringify(medications));
      datos.medications = FieldValue.delete();
    }

    // Historial: lo que llega vacío se borra (antes quedaba el valor viejo y no se podía quitar).
    const historialRef = memberRef.collection(SUBCOLECCION_HISTORIAL).doc(DOC_HISTORIAL);
    const cambiosHistorial: Record<string, unknown> = {};
    for (const [campo, valor] of Object.entries(historialCampos)) {
      cambiosHistorial[`encrypted_${campo}`] = valor.length > 0 ? encryptField(valor) : FieldValue.delete();
      cambiosHistorial[campo] = FieldValue.delete();
    }

    const previoHistorial = Object.keys(historialCampos).length ? await historialRef.get() : null;
    if (previoHistorial) {
      const previo = previoHistorial.exists ? (previoHistorial.data() as any) : {};
      const quedan = CAMPOS_HISTORIAL.some((campo) => {
        if (campo in historialCampos) return historialCampos[campo].length > 0;
        return Boolean(previo[`encrypted_${campo}`] || previo[campo]);
      });
      datos.hasHistory = quedan;
    }

    const ahora = new Date();
    await memberRef.set(
      { ...datos, ...(memberId ? {} : { createdAt: ahora }), updatedAt: ahora, isEncrypted: true },
      { merge: true }
    );
    if (previoHistorial) {
      await historialRef.set({ ...cambiosHistorial, updatedAt: ahora }, { merge: true });
    }

    return { success: true, id: memberRef.id };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[Family Action] Error saving member:', errorMsg);
    return { success: false, error: `Failed to save member data: ${errorMsg}` };
  }
}

/**
 * Guarda el perfil del titular (la cuenta): datos personales y de salud, en el documento
 * de la cuenta. Cambia solo esos campos: los contactos de emergencia y lo demás se conservan.
 */
export async function saveTitularProfile(idToken: string, profileData: any) {
  try {
    const decodedToken = await getAdminAuth().verifyIdToken(idToken);
    const userId = decodedToken.uid;

    checkRateLimit({ userId }, { limit: 10, window: 60, keys: ['userId'] });

    let datos: SaveTitularProfileInput;
    try {
      datos = validateTitularProfile(profileData);
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        const errorMsg = formatZodErrors(validationError);
        console.error('[Family Action] Validation error (titular):', errorMsg);
        return { success: false, error: errorMsg };
      }
      throw validationError;
    }

    const cuentaRef = getAdminDb().collection(COLECCION_TUTOR).doc(userId);
    if (!(await cuentaRef.get()).exists) return { success: false, error: 'No se encontró la cuenta.' };

    const cambios: Record<string, unknown> = {
      'personalInfo.firstName': datos.firstName,
      'personalInfo.lastName': datos.lastName,
      'personalInfo.sex': datos.sex,
      // Mediodía UTC: el día se ve igual en cualquier zona horaria de América.
      'personalInfo.dateOfBirth': new Date(`${datos.dateOfBirth}T12:00:00.000Z`),
      'personalInfo.weight': datos.weight ?? FieldValue.delete(),
      ...camposSaludCifrada(datos, () => FieldValue.delete()),
      updatedAt: new Date(),
    };
    if (datos.country) cambios['personalInfo.country'] = datos.country;
    if (datos.insuranceProvider !== undefined) cambios['personalInfo.insuranceProvider'] = datos.insuranceProvider;
    if (datos.insuranceProviderName !== undefined) cambios['personalInfo.insuranceProviderName'] = datos.insuranceProviderName;

    // Los campos de salud que no llegaron no se tocan.
    for (const campo of CAMPOS_HISTORIAL.filter((c) => c !== 'familyHistory')) {
      if (datos[campo] === undefined) {
        delete cambios[`healthInfo.encrypted_${campo}`];
        delete cambios[`healthInfo.${campo}`];
      }
    }
    if (datos.allergies === undefined) {
      delete cambios['healthInfo.encryptedAllergies'];
      delete cambios['healthInfo.allergies'];
    }
    if (datos.medications === undefined) {
      delete cambios['healthInfo.encryptedMedications'];
      delete cambios['healthInfo.medications'];
    }

    await cuentaRef.update(cambios);

    // El nombre de la cuenta (Auth) sigue al del perfil, como hacía la pantalla anterior.
    try {
      await getAdminAuth().updateUser(userId, { displayName: `${datos.firstName} ${datos.lastName}` });
    } catch (error) {
      console.warn('[Family Action] No se pudo actualizar el nombre en Auth:', error);
    }

    return { success: true, id: ID_TITULAR };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[Family Action] Error saving titular:', errorMsg);
    return { success: false, error: `Failed to save titular data: ${errorMsg}` };
  }
}

/**
 * Elimina a un integrante y todo lo que colgaba de él: historial cifrado, documentos,
 * episodios clínicos y sus conversaciones con la Dra. Hilda. Firestore no borra las
 * subcolecciones al borrar el documento, por eso se hace con borrado recursivo.
 * El titular (la cuenta) no se elimina desde aquí.
 */
export async function deleteFamilyMember(idToken: string, memberId: string) {
  try {
    const decodedToken = await getAdminAuth().verifyIdToken(idToken);
    const userId = decodedToken.uid;

    checkRateLimit({ userId }, { limit: 10, window: 60, keys: ['userId'] });

    if (typeof memberId !== 'string' || !memberId || memberId.includes('/') || memberId === ID_TITULAR) {
      return { success: false, error: 'Integrante no válido.' };
    }

    const db = getAdminDb();
    const cuentaRef = db.collection(COLECCION_TUTOR).doc(userId);
    const memberRef = cuentaRef.collection(SUBCOLECCION_INTEGRANTES).doc(memberId);

    const snap = await memberRef.get();
    if (!snap.exists) return { success: false, error: 'Ese integrante no existe.' };
    if (esTitularGuardado(snap.data())) {
      return { success: false, error: 'El titular es la cuenta y no se elimina desde aquí.' };
    }

    // Primero las conversaciones y al final el integrante: si algo falla a la mitad,
    // el integrante sigue ahí y se puede volver a intentar.
    const conversaciones = await cuentaRef.collection(SUBCOLECCION_CONVERSACIONES).where('memberId', '==', memberId).get();
    for (const conversacion of conversaciones.docs) {
      await db.recursiveDelete(conversacion.ref);
    }
    await db.recursiveDelete(memberRef);

    // Archivos que estuvieran en la zona temporal de lectura de documentos.
    try {
      await getAdminStorage().bucket().deleteFiles({ prefix: `temp_ocr_uploads/${userId}/${memberId}/` });
    } catch (error) {
      console.warn('[Family Action] No se pudo limpiar la zona temporal de Storage:', error);
    }

    return { success: true, conversacionesEliminadas: conversaciones.size };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[Family Action] Error deleting member:', errorMsg);
    return { success: false, error: `Failed to delete member: ${errorMsg}` };
  }
}

/**
 * Obtiene a la familia (titular incluido) descifrada, sin el historial largo (V#5).
 */
export async function getSecureFamilyMembers(idToken: string) {
  try {
    if (!idToken) return [];
    const decodedToken = await getAdminAuth().verifyIdToken(idToken);
    return await leerFamilia(decodedToken.uid, false);
  } catch (error) {
    console.error('[Family Action] Error fetching members:', error);
    return [];
  }
}

/**
 * Obtiene a la familia completa para el familiograma: cada persona con todos sus datos
 * y su historial descifrado.
 */
export async function getSecureFamilyTree(idToken: string): Promise<{ success: true; members: FamilyProfile[] } | { success: false; error: string }> {
  try {
    if (!idToken) return { success: false, error: 'Sesión expirada' };
    const decodedToken = await getAdminAuth().verifyIdToken(idToken);
    return { success: true, members: await leerFamilia(decodedToken.uid, true) };
  } catch (error) {
    console.error('[Family Action] Error fetching family tree:', error);
    return { success: false, error: 'No se pudo cargar la familia.' };
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
    return { updatedAt: data.updatedAt?.toDate?.() || data.updatedAt, ...leerHistorial(data) };
  } catch (error) {
    console.error('[Family Action] Error fetching medical history:', error);
    throw new Error('Failed to fetch secure medical history');
  }
}
