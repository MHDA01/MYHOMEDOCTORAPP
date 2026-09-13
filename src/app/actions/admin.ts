'use server';

import { verifyAdminAccess } from '@/lib/admin-access';

/** Solo dice si la cuenta es administradora; el menú lo usa para mostrar "Administración". */
export async function consultarAccesoAdmin(idToken: string): Promise<boolean> {
  const acceso = await verifyAdminAccess(idToken);
  return acceso.ok;
}
