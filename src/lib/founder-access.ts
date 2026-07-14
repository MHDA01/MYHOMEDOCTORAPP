import { getAdminAuth } from '@/lib/firebase-admin';

export type FounderAccessResult = { ok: true; uid: string } | { ok: false; error: string };

/**
 * Verifica que quien llama sea el fundador (por correo, vía FOUNDER_EMAIL).
 * Usado por todas las herramientas internas solo-fundador (Agente de Crecimiento,
 * revisión de consejos diarios, etc.) para evitar duplicar el chequeo.
 */
export async function verifyFounderAccess(idToken: string): Promise<FounderAccessResult> {
  const founderEmail = process.env.FOUNDER_EMAIL;
  if (!founderEmail) {
    return { ok: false, error: 'Herramienta no configurada (falta FOUNDER_EMAIL).' };
  }

  if (!idToken) {
    return { ok: false, error: 'No autenticado. Por favor, inicia sesión de nuevo.' };
  }

  try {
    const decodedToken = await getAdminAuth().verifyIdToken(idToken);
    if (decodedToken.email !== founderEmail) {
      return { ok: false, error: 'No autorizado para usar esta herramienta.' };
    }
    return { ok: true, uid: decodedToken.uid };
  } catch (error) {
    console.error('[FounderAccess] Error verificando token:', error);
    return { ok: false, error: 'Sesión inválida o expirada. Por favor, inicia sesión de nuevo.' };
  }
}
