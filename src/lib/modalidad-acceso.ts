/**
 * Dónde se guarda la modalidad de acceso de cada cuenta. Solo servidor.
 *
 * El interruptor de `src/config/acceso.ts` abre o cierra la puerta para todos.
 * Esta modalidad es la excepción por cuenta y existe por una promesa: quienes
 * se registraron durante la etapa gratuita quedan **gratis de por vida**, así
 * que al encender el cobro tienen que seguir entrando. El tipo y los nombres
 * están en `src/lib/modalidad.ts`, que sí puede usar el navegador.
 *
 * Vive en su propia colección, `acceso_usuarios/{uid}`, y NO bajo
 * `Cuentas_Tutor/{uid}`: las reglas dejan al dueño escribir su documento y
 * cualquier subcolección suya (`match /{subcol}/{docId}`), así que un campo
 * ahí se lo podría poner el propio usuario y darse acceso gratis. Aquí solo
 * escribe el servidor con el Admin SDK, y las reglas niegan todo al cliente.
 */
import { getAdminDb } from '@/lib/firebase-admin';
import { COLECCION_MODALIDAD } from '@/lib/constants';
import { MODALIDAD_POR_DEFECTO, esModalidad, type Modalidad } from '@/lib/modalidad';

function refModalidad(uid: string) {
  return getAdminDb().collection(COLECCION_MODALIDAD).doc(uid);
}

export async function obtenerModalidad(uid: string): Promise<Modalidad> {
  const snap = await refModalidad(uid).get();
  const guardada = snap.get('modalidad');
  return esModalidad(guardada) ? guardada : MODALIDAD_POR_DEFECTO;
}

/** Las modalidades de varias cuentas de una vez, para listados. */
export async function obtenerModalidades(uids: string[]): Promise<Map<string, Modalidad>> {
  const salida = new Map<string, Modalidad>();
  if (!uids.length) return salida;

  // getAll tiene un tope de documentos por llamada; de a 300 va sobrado.
  for (let i = 0; i < uids.length; i += 300) {
    const lote = uids.slice(i, i + 300);
    const docs = await getAdminDb().getAll(...lote.map(refModalidad));
    for (const doc of docs) {
      const guardada = doc.get('modalidad');
      salida.set(doc.id, esModalidad(guardada) ? guardada : MODALIDAD_POR_DEFECTO);
    }
  }
  return salida;
}

/** Deja escrito quién cambió la modalidad y cuándo: es una decisión comercial, no un ajuste técnico. */
export async function fijarModalidad(uid: string, modalidad: Modalidad, porCorreo: string): Promise<void> {
  await refModalidad(uid).set(
    { modalidad, cambiadaEn: new Date(), cambiadaPor: porCorreo },
    { merge: true }
  );
}

export async function olvidarModalidad(uid: string): Promise<void> {
  await refModalidad(uid).delete();
}
