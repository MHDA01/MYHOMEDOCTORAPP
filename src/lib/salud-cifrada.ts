/**
 * Lectura y escritura cifrada de la información de salud de la cuenta (el titular).
 * La usan las acciones del servidor de usuario y de familia, para que las dos lean
 * y cifren exactamente igual.
 */

import { decryptField, encryptField } from '@/lib/crypto';

const CAMPOS_HISTORIAL = ['pathologicalHistory', 'surgicalHistory', 'gynecologicalHistory'] as const;

export function descifrarLista(valor: unknown): string[] {
  if (typeof valor !== 'string' || !valor) return [];
  try {
    const parsed = JSON.parse(decryptField(valor));
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Devuelve healthInfo con alergias, medicamentos e historial en claro. */
export function descifrarSaludTitular(documento: any): any {
  const bruto = documento?.healthInfo || {};
  const salud: any = { ...bruto };

  if (documento?.isEncrypted || bruto.isEncrypted) {
    salud.allergies = descifrarLista(bruto.encryptedAllergies);
    salud.medications = descifrarLista(bruto.encryptedMedications);
    for (const campo of CAMPOS_HISTORIAL) {
      const cifrado = bruto[`encrypted_${campo}`];
      salud[campo] = typeof cifrado === 'string' && cifrado ? decryptField(cifrado) : bruto[campo] || '';
    }
    delete salud.encryptedAllergies;
    delete salud.encryptedMedications;
    for (const campo of CAMPOS_HISTORIAL) delete salud[`encrypted_${campo}`];
  } else {
    salud.allergies = Array.isArray(bruto.allergies) ? bruto.allergies : [];
    salud.medications = Array.isArray(bruto.medications) ? bruto.medications : [];
    for (const campo of CAMPOS_HISTORIAL) salud[campo] = bruto[campo] || '';
  }
  return salud;
}

/**
 * Campos cifrados de healthInfo como rutas con punto, para `update()`: cambian solo
 * esos campos y dejan el resto de healthInfo (por ejemplo los contactos de emergencia).
 */
export function camposSaludCifrada(
  salud: { allergies?: string[]; medications?: string[]; pathologicalHistory?: string; surgicalHistory?: string; gynecologicalHistory?: string },
  borrar: () => unknown
): Record<string, unknown> {
  return {
    'healthInfo.isEncrypted': true,
    'healthInfo.encryptedAllergies': encryptField(JSON.stringify(salud.allergies ?? [])),
    'healthInfo.encryptedMedications': encryptField(JSON.stringify(salud.medications ?? [])),
    'healthInfo.encrypted_pathologicalHistory': encryptField(salud.pathologicalHistory ?? ''),
    'healthInfo.encrypted_surgicalHistory': encryptField(salud.surgicalHistory ?? ''),
    'healthInfo.encrypted_gynecologicalHistory': encryptField(salud.gynecologicalHistory ?? ''),
    // Si el dato antiguo estaba en claro, no debe quedar una copia sin cifrar.
    'healthInfo.allergies': borrar(),
    'healthInfo.medications': borrar(),
    'healthInfo.pathologicalHistory': borrar(),
    'healthInfo.surgicalHistory': borrar(),
    'healthInfo.gynecologicalHistory': borrar(),
  };
}
