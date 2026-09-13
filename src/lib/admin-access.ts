import { getAdminAuth } from '@/lib/firebase-admin';

export type AdminAccessResult = { ok: true; uid: string; email: string } | { ok: false; error: string };

/**
 * Correos con acceso al panel de administración (ADMIN_EMAILS, separados por coma).
 *
 * Vive en un secreto del servidor y no en el código ni en una variable
 * NEXT_PUBLIC_: el repositorio es público y el correo del administrador no debe
 * quedar a la vista ni viajar al navegador.
 */
function correosAdmin(): string[] {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((correo) => correo.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Verifica que quien llama sea administrador. Toda acción de administración pasa
 * por aquí en el servidor: el menú del cliente solo decide qué se muestra.
 */
export async function verifyAdminAccess(idToken: string): Promise<AdminAccessResult> {
  const admins = correosAdmin();
  if (!admins.length) {
    return { ok: false, error: 'Panel no configurado (falta ADMIN_EMAILS).' };
  }
  if (!idToken) {
    return { ok: false, error: 'No autenticado. Por favor, inicia sesión de nuevo.' };
  }

  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    const email = decoded.email?.toLowerCase();
    if (!email || !admins.includes(email)) {
      return { ok: false, error: 'No autorizado para usar esta herramienta.' };
    }
    return { ok: true, uid: decoded.uid, email };
  } catch (error) {
    console.error('[AdminAccess] Error verificando token:', error);
    return { ok: false, error: 'Sesión inválida o expirada. Por favor, inicia sesión de nuevo.' };
  }
}
