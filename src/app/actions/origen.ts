// ============================================================
// app/actions/origen.ts — Cuenta visitas y registros por red social.
//
// Escribe solo totales en Metricas_Origen/{red} (las reglas de Firestore niegan
// esa colección al teléfono; aquí se escribe con el Admin SDK). Nunca guarda el
// uid, el correo ni la dirección IP de nadie.
// ============================================================
'use server';

import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { COLECCION_ORIGEN, diaBogota, normalizarFuente, type Fuente } from '@/lib/origen';

/** Un registro solo se atribuye si la cuenta se creó hace menos de esto. */
const VENTANA_REGISTRO_MS = 15 * 60 * 1000;

async function sumar(fuente: Fuente, campo: 'visitas' | 'registros'): Promise<void> {
  const uno = FieldValue.increment(1);
  await getAdminDb()
    .collection(COLECCION_ORIGEN)
    .doc(fuente)
    .set(
      { fuente, [campo]: uno, dias: { [diaBogota(Date.now())]: { [campo]: uno } }, actualizado: FieldValue.serverTimestamp() },
      { merge: true }
    );
}

/** Una visita que llegó con ?utm_source=<red>. El navegador la manda una vez al día por red. */
export async function registrarVisitaOrigen(fuente: unknown): Promise<{ contada: boolean }> {
  const valida = normalizarFuente(fuente);
  if (!valida) return { contada: false };
  try {
    await sumar(valida, 'visitas');
    return { contada: true };
  } catch (error) {
    console.error('[Origen] No se pudo contar la visita:', error);
    return { contada: false };
  }
}

/** Atribuye a la red la cuenta recién creada con este ID token. */
export async function registrarRegistroOrigen(idToken: unknown, fuente: unknown): Promise<{ contado: boolean }> {
  const valida = normalizarFuente(fuente);
  if (!valida || typeof idToken !== 'string' || !idToken) return { contado: false };
  try {
    const { uid } = await getAdminAuth().verifyIdToken(idToken);
    const cuenta = await getAdminAuth().getUser(uid);
    const creada = new Date(cuenta.metadata.creationTime).getTime();
    if (Number.isNaN(creada) || Date.now() - creada > VENTANA_REGISTRO_MS) return { contado: false };
    await sumar(valida, 'registros');
    return { contado: true };
  } catch (error) {
    console.error('[Origen] No se pudo contar el registro:', error);
    return { contado: false };
  }
}
