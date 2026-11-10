/**
 * Dónde vive la ficha de cada integrante. Solo servidor.
 *
 * La ficha se guarda **fuera** de `Cuentas_Tutor` a propósito, igual que la
 * modalidad de acceso y por un motivo más fuerte: bajo `Integrantes/{id}` las
 * reglas tienen un comodín recursivo (`{path=**}`) que le da escritura al dueño
 * sobre todo lo que cuelgue de ahí, y en un comodín recursivo no se puede
 * excluir una subcolección como sí se hace con `tokens`.
 *
 * Si el navegador pudiera escribir la ficha, se saltaría `registrar()` —y con
 * él la regla de que todo hallazgo traiga la frase literal de la que salió—, que
 * es justo la defensa que hace confiable al extractor.
 *
 * `fichas_clinicas/{uid}/integrantes/{integranteId}`, con `allow read, write:
 * if false` en `firestore.rules`. Se borra con la cuenta desde
 * `datos-de-la-cuenta.ts`.
 */

import { getAdminDb } from '@/lib/firebase-admin';
import { COLECCION_FICHAS, SUBCOLECCION_FICHAS_INTEGRANTES } from '@/lib/constants';
import { fichaVacia, type Ficha } from '@/lib/ficha';

function refFicha(uid: string, integranteId: string) {
  return getAdminDb()
    .collection(COLECCION_FICHAS)
    .doc(uid)
    .collection(SUBCOLECCION_FICHAS_INTEGRANTES)
    .doc(integranteId);
}

/**
 * La ficha guardada, o `null` si no hay ninguna todavía.
 *
 * `null` y "ficha vacía" son cosas distintas y por eso no se confunden aquí:
 * sin ficha guardada, quien llama la levanta del perfil; con una vacía, la
 * respeta. Devolver una vacía en el primer caso borraría en silencio lo que el
 * perfil ya sabía.
 */
export async function leerFicha(uid: string, integranteId: string): Promise<Ficha | null> {
  const snap = await refFicha(uid, integranteId).get();
  if (!snap.exists) return null;
  const campos = snap.get('campos');
  if (!campos || typeof campos !== 'object') return fichaVacia(integranteId);
  return { integranteId, campos };
}

/**
 * Guarda la ficha entera.
 *
 * Se escribe completa y no por campos porque el objeto ya viene validado: lo
 * que llega aquí pasó por `registrar()` y por `incorporarHallazgos`, así que no
 * hay nada que mezclar en este punto. Mezclar aquí volvería a abrir la puerta a
 * que dos turnos a la vez se pisen sin que nadie lo note.
 */
export async function guardarFicha(uid: string, ficha: Ficha): Promise<void> {
  await refFicha(uid, ficha.integranteId).set(
    { campos: ficha.campos, actualizada: new Date().toISOString().slice(0, 10) },
    { merge: false }
  );
}
