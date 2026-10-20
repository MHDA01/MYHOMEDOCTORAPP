// ============================================================
// app/actions/admin-usuarios.ts — Server Actions que CAMBIAN una cuenta
// desde el panel de administración: su modalidad de acceso y su eliminación.
//
// admin-seguimiento.ts solo lee; esto escribe y borra. Las dos puertas pasan
// por verifyAdminAccess en el servidor: el menú del cliente solo decide qué se
// muestra.
// ============================================================
'use server';

import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { esCorreoAdmin, verifyAdminAccess } from '@/lib/admin-access';
import { COLECCION_TUTOR } from '@/lib/constants';
import { esModalidad, type Modalidad } from '@/lib/modalidad';
import { fijarModalidad, olvidarModalidad } from '@/lib/modalidad-acceso';

type Resultado<T> = { success: true; data: T } | { success: false; error: string };

/**
 * Pasa una cuenta a gratis de por vida o a pago.
 *
 * Mientras ACCESO_LIBRE siga en `true` esto no bloquea a nadie: queda escrito
 * para el día en que se encienda el cobro. Ver src/lib/modalidad-acceso.ts.
 */
export async function cambiarModalidadUsuario(
  idToken: string,
  uid: string,
  modalidad: Modalidad
): Promise<Resultado<{ uid: string; modalidad: Modalidad }>> {
  const acceso = await verifyAdminAccess(idToken);
  if (!acceso.ok) return { success: false, error: acceso.error };

  if (!uid.trim()) return { success: false, error: 'Falta la cuenta que se va a cambiar.' };
  if (!esModalidad(modalidad)) return { success: false, error: 'Esa modalidad no existe.' };

  try {
    await getAdminAuth().getUser(uid);
  } catch {
    return { success: false, error: 'Esa cuenta ya no existe.' };
  }

  try {
    await fijarModalidad(uid, modalidad, acceso.email);
    console.info(`[Admin] ${acceso.email} dejó la cuenta ${uid} en modalidad "${modalidad}".`);
    return { success: true, data: { uid, modalidad } };
  } catch (error) {
    console.error('[Admin] Error cambiando la modalidad:', error);
    return { success: false, error: 'No se pudo cambiar la modalidad.' };
  }
}

/**
 * Borra una cuenta y todo lo suyo: ficha, familia, conversaciones, informes,
 * documentos y su modalidad de acceso. No tiene vuelta atrás.
 *
 * Pide el correo escrito a mano (`confirmacion`) porque la lista está ordenada
 * y un clic de más borraría a la persona equivocada. Es también la vía para
 * atender una solicitud de supresión de datos (Ley 1581 de 2012).
 */
export async function eliminarUsuarioAdmin(
  idToken: string,
  uid: string,
  confirmacion: string
): Promise<Resultado<{ uid: string }>> {
  const acceso = await verifyAdminAccess(idToken);
  if (!acceso.ok) return { success: false, error: acceso.error };

  if (!uid.trim()) return { success: false, error: 'Falta la cuenta que se va a eliminar.' };
  if (uid === acceso.uid) return { success: false, error: 'No puedes eliminar tu propia cuenta desde aquí.' };

  let correo: string | undefined;
  try {
    correo = (await getAdminAuth().getUser(uid)).email ?? undefined;
  } catch {
    return { success: false, error: 'Esa cuenta ya no existe.' };
  }

  if (esCorreoAdmin(correo)) {
    return { success: false, error: 'Esa cuenta es de administración: quítale el acceso en ADMIN_EMAILS antes de borrarla.' };
  }

  // Sin correo (teléfono, por ejemplo) se confirma con el identificador.
  const esperado = (correo ?? uid).trim().toLowerCase();
  if (confirmacion.trim().toLowerCase() !== esperado) {
    return { success: false, error: `Para confirmar, escribe exactamente ${correo ?? uid}.` };
  }

  try {
    // Primero los datos y después la cuenta: si algo falla a mitad de camino,
    // la persona conserva su acceso y se puede reintentar, en vez de quedar
    // una cuenta viva sin nada o datos sin dueño.
    await getAdminDb().recursiveDelete(getAdminDb().collection(COLECCION_TUTOR).doc(uid));
    await olvidarModalidad(uid);
    await getAdminAuth().deleteUser(uid);
    console.info(`[Admin] ${acceso.email} eliminó la cuenta ${uid} y todos sus datos.`);
    return { success: true, data: { uid } };
  } catch (error) {
    console.error('[Admin] Error eliminando la cuenta:', error);
    return { success: false, error: 'No se pudo eliminar la cuenta. Puede haber quedado a medias: vuelve a intentarlo.' };
  }
}
