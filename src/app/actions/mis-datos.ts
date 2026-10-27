// ============================================================
// app/actions/mis-datos.ts — Los dos derechos que la persona ejerce sola:
// llevarse una copia de todo lo suyo y pedir que no quede nada.
//
// Ley 1581 de 2012. Lo que se lee y lo que se borra está en
// src/lib/datos-de-la-cuenta.ts, compartido con el panel de administración
// para que las dos vías borren exactamente lo mismo.
//
// El uid sale siempre del token verificado, nunca del cliente.
// ============================================================
'use server';

import { getAdminAuth } from '@/lib/firebase-admin';
import { esCorreoAdmin } from '@/lib/admin-access';
import { checkRateLimit } from '@/lib/rate-limit';
import {
  borrarDatosDeLaCuenta,
  copiarDatosDeLaCuenta,
  type CopiaDeLaCuenta,
} from '@/lib/datos-de-la-cuenta';

type Resultado<T> = { success: true; data: T } | { success: false; error: string };

const SESION_INVALIDA = 'Tu sesión expiró. Vuelve a iniciar sesión e inténtalo de nuevo.';

async function sesion(idToken: string): Promise<{ uid: string; correo: string | null } | null> {
  if (!idToken) return null;
  try {
    const token = await getAdminAuth().verifyIdToken(idToken);
    return { uid: token.uid, correo: token.email ?? null };
  } catch (error) {
    console.error('[Mis datos] Sesión no válida:', error);
    return null;
  }
}

/**
 * Entrega una copia completa de la cuenta, con los campos cifrados abiertos.
 * La página la guarda como archivo; aquí solo se arma.
 */
export async function descargarMisDatos(idToken: string): Promise<Resultado<CopiaDeLaCuenta>> {
  const quien = await sesion(idToken);
  if (!quien) return { success: false, error: SESION_INVALIDA };

  try {
    // Armar la copia recorre toda la cuenta; diez por hora sobran de lejos.
    checkRateLimit({ userId: quien.uid }, { limit: 10, window: 3600, keys: ['userId'] });
  } catch {
    return { success: false, error: 'Pediste tus datos varias veces seguidas. Espera un momento e inténtalo otra vez.' };
  }

  try {
    const usuario = await getAdminAuth().getUser(quien.uid);
    const copia = await copiarDatosDeLaCuenta(quien.uid, {
      correo: usuario.email ?? null,
      creadaEn: usuario.metadata.creationTime ? new Date(usuario.metadata.creationTime).toISOString() : null,
      ultimoIngreso: usuario.metadata.lastSignInTime ? new Date(usuario.metadata.lastSignInTime).toISOString() : null,
    });
    return { success: true, data: copia };
  } catch (error) {
    console.error('[Mis datos] Error armando la copia de una cuenta:', error);
    return { success: false, error: 'No se pudo preparar tu copia. Inténtalo de nuevo en un momento.' };
  }
}

/**
 * Borra la cuenta y todo lo que la app guarda de ella. No tiene vuelta atrás.
 *
 * Pide el correo escrito a mano por la misma razón que el panel de
 * administración: un clic de más no puede borrar la historia de una familia.
 */
export async function eliminarMiCuenta(idToken: string, confirmacion: string): Promise<Resultado<{ uid: string }>> {
  const quien = await sesion(idToken);
  if (!quien) return { success: false, error: SESION_INVALIDA };

  try {
    checkRateLimit({ userId: quien.uid }, { limit: 5, window: 3600, keys: ['userId'] });
  } catch {
    return { success: false, error: 'Demasiados intentos seguidos. Espera un momento e inténtalo otra vez.' };
  }

  let correo: string | null;
  try {
    correo = (await getAdminAuth().getUser(quien.uid)).email ?? null;
  } catch (error) {
    console.error('[Mis datos] No se pudo leer la cuenta que se iba a eliminar:', error);
    return { success: false, error: SESION_INVALIDA };
  }

  // Una cuenta de administración no se borra desde aquí: se quita de
  // ADMIN_EMAILS primero, o la app se queda sin quién la atienda.
  if (esCorreoAdmin(correo)) {
    return { success: false, error: 'Esta es una cuenta de administración y no se elimina desde aquí.' };
  }

  // Sin correo (una cuenta creada con teléfono, por ejemplo) se confirma con el identificador.
  const esperado = (correo ?? quien.uid).trim().toLowerCase();
  if (confirmacion.trim().toLowerCase() !== esperado) {
    return { success: false, error: `Para confirmar, escribe exactamente ${correo ?? quien.uid}.` };
  }

  try {
    // Primero los datos y al final la cuenta: si algo falla a mitad de camino,
    // la persona conserva su acceso y puede volver a intentarlo, en vez de
    // quedar una cuenta viva sin nada o datos sin dueño.
    await borrarDatosDeLaCuenta(quien.uid);
    await getAdminAuth().deleteUser(quien.uid);
    console.info(`[Mis datos] Una persona eliminó su propia cuenta (${quien.uid}) y todos sus datos.`);
    return { success: true, data: { uid: quien.uid } };
  } catch (error) {
    console.error('[Mis datos] Error eliminando una cuenta a petición de su dueña:', error);
    return { success: false, error: 'No se pudo completar el borrado. Puede haber quedado a medias: vuelve a intentarlo.' };
  }
}
