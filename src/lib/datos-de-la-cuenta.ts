/**
 * Lo que cuelga de una cuenta: cómo se lee entera para entregársela a su dueña
 * y cómo se borra sin que quede nada.
 *
 * Son los dos derechos de la Ley 1581 de 2012 que la app tiene que poder
 * atender sola: acceso (una copia de todo) y supresión. Vive aquí y no dentro
 * de una Server Action para que la página "Mis datos" y el panel de
 * administración borren exactamente lo mismo; si mañana aparece una
 * subcolección nueva, basta con que cuelgue de `Cuentas_Tutor/{uid}` para que
 * salga en la copia y se vaya en el borrado.
 *
 * Solo servidor: usa el Admin SDK.
 */
import { getAdminDb, getAdminStorage } from '@/lib/firebase-admin';
import { decryptField } from '@/lib/crypto';
import { COLECCION_FICHAS, COLECCION_TUTOR } from '@/lib/constants';
import { olvidarModalidad } from '@/lib/modalidad-acceso';

/** Carpetas de Storage que llevan el uid de la cuenta en el primer tramo. */
const PREFIJOS_STORAGE = ['temp_ocr_uploads', 'medical-images', 'medical_documents'];

/**
 * Colecciones sueltas de la versión anterior de la app. Ya nadie las escribe,
 * pero puede haber documentos viejos con el uid de la persona, así que el
 * borrado tiene que pasar por ahí. No entran en la copia: no hay nada que
 * mostrarle a nadie y sus nombres no deben aparecer en un archivo que la
 * persona abre.
 */
const COLECCIONES_ANTIGUAS = ['app_triage_sessions', 'alarms'];

/** Control de frecuencia del chat. Es operativo, no es dato de la persona, pero lleva su uid. */
const COLECCION_LIMITES = 'rate_limits';

const PREFIJO_CIFRADO = 'encrypted_';
const LISTAS_CIFRADAS: Record<string, string> = {
  encryptedAllergies: 'allergies',
  encryptedMedications: 'medications',
};

const SIN_DESCIFRAR = '(no se pudo descifrar)';

/** Tope de anidamiento al recorrer campos y subcolecciones. Ningún dato de la app llega tan hondo. */
const PROFUNDIDAD_MAXIMA = 8;

/** Tope de documentos en una copia, para que una cuenta enorme no tumbe el servidor. */
const MAX_DOCUMENTOS = 10000;

function enClaro(valor: unknown): string {
  if (typeof valor !== 'string' || !valor) return '';
  try {
    return decryptField(valor);
  } catch {
    return SIN_DESCIFRAR;
  }
}

function listaEnClaro(valor: unknown): string[] {
  const texto = enClaro(valor);
  if (!texto) return [];
  if (texto === SIN_DESCIFRAR) return [SIN_DESCIFRAR];
  try {
    const leido = JSON.parse(texto);
    return Array.isArray(leido) ? leido.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function valorLegible(valor: unknown, profundidad: number): unknown {
  if (valor === null || valor === undefined) return null;
  if (valor instanceof Date) return valor.toISOString();
  if (typeof valor === 'object') {
    const posibleFecha = (valor as { toDate?: () => Date }).toDate;
    if (typeof posibleFecha === 'function') return posibleFecha.call(valor).toISOString();
    // Referencias a otros documentos: su ruta dice todo lo que hay que decir.
    const ruta = (valor as { path?: unknown }).path;
    if (typeof ruta === 'string') return ruta;
    if (profundidad >= PROFUNDIDAD_MAXIMA) return null;
    if (Array.isArray(valor)) return valor.map((item) => valorLegible(item, profundidad + 1));
    return camposEnClaro(valor as Record<string, unknown>, profundidad + 1);
  }
  return valor;
}

/**
 * Un documento con sus campos cifrados abiertos y sus fechas en texto. Si una
 * pieza no se puede descifrar queda marcada y el resto de la copia sigue: una
 * llave vieja en un campo suelto no puede dejar a la persona sin sus datos.
 */
export function camposEnClaro(data: Record<string, unknown>, profundidad = 0): Record<string, unknown> {
  const salida: Record<string, unknown> = {};
  const descifrados = new Map<string, unknown>();

  for (const [clave, valor] of Object.entries(data)) {
    if (clave === 'isEncrypted') continue;

    const nombreLista = LISTAS_CIFRADAS[clave];
    if (nombreLista) {
      descifrados.set(nombreLista, listaEnClaro(valor));
      continue;
    }
    if (clave.startsWith(PREFIJO_CIFRADO)) {
      descifrados.set(clave.slice(PREFIJO_CIFRADO.length), enClaro(valor));
      continue;
    }
    if (clave === 'content' && data.isEncrypted === true) {
      descifrados.set('content', enClaro(valor));
      continue;
    }
    salida[clave] = valorLegible(valor, profundidad);
  }

  // El campo cifrado manda sobre la copia en claro que pueda quedar del esquema anterior.
  for (const [clave, valor] of descifrados) salida[clave] = valor;
  return salida;
}

type Contador = { documentos: number };

async function volcarSubcolecciones(
  ref: FirebaseFirestore.DocumentReference,
  nivel: number,
  contador: Contador
): Promise<Record<string, unknown[]>> {
  if (nivel >= PROFUNDIDAD_MAXIMA || contador.documentos >= MAX_DOCUMENTOS) return {};

  const colecciones = await ref.listCollections();
  const salida: Record<string, unknown[]> = {};

  for (const coleccion of colecciones) {
    const snap = await coleccion.get();
    if (snap.empty) continue;

    const documentos: unknown[] = [];
    for (const doc of snap.docs) {
      if (contador.documentos >= MAX_DOCUMENTOS) break;
      contador.documentos += 1;
      const hijas = await volcarSubcolecciones(doc.ref, nivel + 1, contador);
      documentos.push({
        id: doc.id,
        ...camposEnClaro(doc.data() ?? {}),
        ...(Object.keys(hijas).length ? { subcolecciones: hijas } : {}),
      });
    }
    salida[coleccion.id] = documentos;
  }

  return salida;
}

export type CopiaDeLaCuenta = {
  generadaEn: string;
  cuenta: {
    id: string;
    correo: string | null;
    creadaEn: string | null;
    ultimoIngreso: string | null;
  };
  /** El documento de la cuenta: datos personales y salud del titular, ya en claro. */
  titular: Record<string, unknown>;
  /** Familia, conversaciones, informes, documentos: todo lo que cuelga de la cuenta. */
  subcolecciones: Record<string, unknown[]>;
  /** Verdadero si la cuenta tenía más documentos de los que cabe entregar de una vez. */
  incompleta: boolean;
};

/**
 * Arma la copia completa de una cuenta. `datosDeAuth` lo pasa quien llama
 * porque el correo y las fechas de ingreso viven en Auth, no en Firestore.
 */
export async function copiarDatosDeLaCuenta(
  uid: string,
  datosDeAuth: { correo: string | null; creadaEn: string | null; ultimoIngreso: string | null }
): Promise<CopiaDeLaCuenta> {
  const cuentaRef = getAdminDb().collection(COLECCION_TUTOR).doc(uid);
  const cuentaSnap = await cuentaRef.get();
  const contador: Contador = { documentos: cuentaSnap.exists ? 1 : 0 };
  const subcolecciones = await volcarSubcolecciones(cuentaRef, 0, contador);

  return {
    generadaEn: new Date().toISOString(),
    cuenta: { id: uid, ...datosDeAuth },
    titular: cuentaSnap.exists ? camposEnClaro(cuentaSnap.data() ?? {}) : {},
    subcolecciones,
    incompleta: contador.documentos >= MAX_DOCUMENTOS,
  };
}

/** Los archivos de la persona en Storage: fotos del chat y documentos médicos. */
async function borrarArchivos(uid: string): Promise<void> {
  // Un archivo que no se pudo borrar no debe dejar viva la cuenta entera: queda
  // en los registros y el borrado sigue. Sin bucket configurado (los
  // emuladores, por ejemplo) no hay nada que limpiar.
  try {
    const bucket = getAdminStorage().bucket();
    for (const prefijo of PREFIJOS_STORAGE) {
      await bucket.deleteFiles({ prefix: `${prefijo}/${uid}/` });
    }
  } catch (error) {
    console.error('[Datos] No se pudieron borrar los archivos de una cuenta:', error);
  }
}

/**
 * Borra todo lo que la app guarda de una cuenta: su ficha, su familia, sus
 * conversaciones, sus informes, sus archivos y su modalidad de acceso.
 *
 * Lo único que NO se borra es `auditoria_consultas`: ahí está quién abrió una
 * consulta y cuándo, sin un solo dato de salud. Es la constancia de quién vio
 * los datos de la persona, y borrarla sería borrar justamente la prueba que la
 * protege; sin la cuenta, ese registro ya no apunta a nadie.
 *
 * No borra la cuenta de Auth: eso lo decide quien llama.
 */
export async function borrarDatosDeLaCuenta(uid: string): Promise<void> {
  const db = getAdminDb();

  await db.recursiveDelete(db.collection(COLECCION_TUTOR).doc(uid));
  await olvidarModalidad(uid);
  await db.collection(COLECCION_LIMITES).doc(uid).delete();
  // Las fichas clínicas viven fuera de Cuentas_Tutor (ver `ficha-guardada.ts`),
  // así que el borrado en cascada de arriba no las alcanza. Son antecedentes de
  // salud: si esto se olvida, quedan datos sensibles de una cuenta borrada.
  await db.recursiveDelete(db.collection(COLECCION_FICHAS).doc(uid));

  for (const nombre of COLECCIONES_ANTIGUAS) {
    const viejos = await db.collection(nombre).where('userId', '==', uid).get();
    await Promise.all(viejos.docs.map((doc) => doc.ref.delete()));
  }

  await borrarArchivos(uid);
}
