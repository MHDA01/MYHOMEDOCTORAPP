/**
 * Ficha de la persona por la que se hizo una consulta, armada desde los
 * documentos crudos de Firestore y con los campos sensibles ya descifrados.
 *
 * El panel del médico no puede usar `leerFamilia` de `app/actions/family.ts`:
 * ese archivo es 'use server', así que exportarlo lo convertiría en una Server
 * Action pública a la que cualquiera podría pasarle un uid ajeno. Aquí vive
 * solo la lectura de UNA persona, sin tocar la red, para poder probarla suelta.
 */

import { decryptField } from '@/lib/crypto';
import { descifrarLista, descifrarSaludTitular } from '@/lib/salud-cifrada';
import { calcularEdad, normalizarFechaNacimiento, normalizarSexo } from '@/lib/familia';
import type { PerfilExistente } from '@/lib/ficha';

/** Id que usa la app cuando el titular no tiene documento propio en Integrantes. */
export const ID_TITULAR = 'titular';

const CAMPOS_HISTORIAL = ['pathologicalHistory', 'surgicalHistory', 'gynecologicalHistory', 'familyHistory'] as const;

const ETIQUETA_HISTORIAL: Record<(typeof CAMPOS_HISTORIAL)[number], string> = {
  pathologicalHistory: 'Patológicos',
  surgicalHistory: 'Quirúrgicos',
  gynecologicalHistory: 'Ginecoobstétricos',
  familyHistory: 'Familiares',
};

const SEXO_EN_TEXTO: Record<string, string> = { male: 'masculino', female: 'femenino', other: '' };

export interface PacienteDeConsulta {
  nombre: string;
  edad?: number;
  sexo?: string;
  alergias: string[];
  medicamentos: string[];
  /** "Patológicos: asma" y demás, solo los que tienen contenido. */
  antecedentes: string[];
}

function fechaGuardada(valor: any): string {
  if (typeof valor?.toDate === 'function') return valor.toDate().toISOString().slice(0, 10);
  return normalizarFechaNacimiento(valor) ?? '';
}

/** Lista cifrada; si el dato viejo quedó en claro (antes del cifrado) se conserva. */
function lista(data: any, cifrado: string, claro: string): string[] {
  if (typeof data?.[cifrado] === 'string' && data[cifrado]) return descifrarLista(data[cifrado]);
  return Array.isArray(data?.[claro]) ? data[claro].filter((x: unknown) => typeof x === 'string') : [];
}

function antecedentesDe(fuente: any, prefijo = ''): string[] {
  const salida: string[] = [];
  for (const campo of CAMPOS_HISTORIAL) {
    const cifrado = fuente?.[`${prefijo}encrypted_${campo}`];
    const texto = typeof cifrado === 'string' && cifrado ? decryptField(cifrado) : fuente?.[campo] || '';
    if (texto.trim()) salida.push(`${ETIQUETA_HISTORIAL[campo]}: ${texto.trim()}`);
  }
  return salida;
}

function nombreDe(firstName: unknown, lastName: unknown): string {
  return [firstName, lastName].filter((p) => typeof p === 'string' && p).join(' ').trim();
}

function sexoYEdad(fechaNacimiento: string, sexo: unknown, hoy: Date) {
  return {
    edad: calcularEdad(fechaNacimiento, hoy),
    sexo: SEXO_EN_TEXTO[normalizarSexo(sexo)] || undefined,
  };
}

/**
 * Ficha de un integrante de la familia (no el titular).
 * `historial` es el documento `Integrantes/{id}/historial/registro`, si existe.
 */
export function pacienteDeIntegrante(integrante: any, historial: any, hoy: Date = new Date()): PacienteDeConsulta {
  const fechaNacimiento = fechaGuardada(integrante?.dateOfBirth);
  const { edad, sexo } = sexoYEdad(fechaNacimiento, integrante?.sex, hoy);
  return {
    nombre: nombreDe(integrante?.firstName, integrante?.lastName),
    edad: edad ?? (typeof integrante?.age === 'number' ? integrante.age : undefined),
    sexo,
    alergias: lista(integrante, 'encryptedAllergies', 'allergies'),
    medicamentos: lista(integrante, 'encryptedMedications', 'medications'),
    antecedentes: antecedentesDe(historial),
  };
}

/** Ficha del titular, que vive en el documento de la cuenta y no en Integrantes. */
export function pacienteDeTitular(cuenta: any, hoy: Date = new Date()): PacienteDeConsulta {
  const personal = cuenta?.personalInfo || {};
  const salud = descifrarSaludTitular(cuenta);
  const fechaNacimiento = fechaGuardada(personal.dateOfBirth);
  const { edad, sexo } = sexoYEdad(fechaNacimiento, personal.sex, hoy);
  return {
    nombre: nombreDe(personal.firstName, personal.lastName),
    edad,
    sexo,
    alergias: Array.isArray(salud.allergies) ? salud.allergies : [],
    medicamentos: Array.isArray(salud.medications) ? salud.medications : [],
    antecedentes: antecedentesDe(salud),
  };
}

/** True si ese documento de Integrantes es en realidad el titular (dato antiguo). */
export function esTitularGuardado(data: any): boolean {
  return Boolean(data?.esTitular) || data?.relationship === 'Titular';
}

// ─────────────────────────────────────────────────────────────
// La misma lectura, en la forma que espera la ficha del grafo
// ─────────────────────────────────────────────────────────────
//
// `PacienteDeConsulta` es una vista aplanada para que el médico la lea: las
// alergias ya son una lista de cadenas y los antecedentes vienen con su
// etiqueta pegada ("Patológicos: asma"). Para levantar la ficha
// (`fichaDesdePerfil`) hace falta lo contrario: los campos crudos, cada uno por
// su lado, sin etiquetas ni mezclas.
//
// Las dos salidas viven aquí para que el **descifrado esté escrito una sola
// vez**. Si mañana cambia cómo se guardan las alergias, cambia en un sitio y
// las dos vistas lo heredan.

/** El texto de un campo del historial, descifrado y sin etiqueta. */
function textoHistorial(fuente: any, campo: (typeof CAMPOS_HISTORIAL)[number]): string | undefined {
  const cifrado = fuente?.[`encrypted_${campo}`];
  const texto = typeof cifrado === 'string' && cifrado ? decryptField(cifrado) : fuente?.[campo] || '';
  return texto.trim() || undefined;
}

function historialCrudo(fuente: any) {
  return {
    pathologicalHistory: textoHistorial(fuente, 'pathologicalHistory'),
    surgicalHistory: textoHistorial(fuente, 'surgicalHistory'),
    gynecologicalHistory: textoHistorial(fuente, 'gynecologicalHistory'),
    familyHistory: textoHistorial(fuente, 'familyHistory'),
  };
}

/** El sexo como lo guarda el perfil, no como se lee: la ficha quiere el valor crudo. */
function sexoCrudo(valor: unknown): 'male' | 'female' | 'other' | undefined {
  const normal = normalizarSexo(valor);
  return normal === 'male' || normal === 'female' || normal === 'other' ? normal : undefined;
}

/**
 * El perfil de un integrante en la forma que pide `fichaDesdePerfil`.
 *
 * `creadoEl` importa y no es un adorno: `fichaDesdePerfil` lo usa para detectar
 * la fecha de nacimiento que el formulario de registro inventa (la del día en
 * que se creó la cuenta). Sin él, un adulto entraría a la ficha con edad cero y
 * las alarmas pediátricas se dispararían con todo el mundo.
 */
export function perfilDeIntegrante(id: string, integrante: any, historial: any): PerfilExistente {
  return {
    id,
    sex: sexoCrudo(integrante?.sex),
    dateOfBirth: fechaGuardada(integrante?.dateOfBirth) || undefined,
    creadoEl: fechaGuardada(integrante?.createdAt) || undefined,
    weight: typeof integrante?.weight === 'number' ? integrante.weight : undefined,
    allergies: lista(integrante, 'encryptedAllergies', 'allergies'),
    medications: lista(integrante, 'encryptedMedications', 'medications'),
    ...historialCrudo(historial),
  };
}

/** Lo mismo para el titular, cuya salud vive en el documento de la cuenta. */
export function perfilDeTitular(id: string, cuenta: any): PerfilExistente {
  const personal = cuenta?.personalInfo || {};
  const salud = descifrarSaludTitular(cuenta);
  return {
    id,
    sex: sexoCrudo(personal.sex),
    dateOfBirth: fechaGuardada(personal.dateOfBirth) || undefined,
    creadoEl: fechaGuardada(cuenta?.createdAt) || undefined,
    weight: typeof (salud as any)?.weight === 'number' ? (salud as any).weight : undefined,
    allergies: Array.isArray(salud.allergies) ? salud.allergies : [],
    medications: Array.isArray(salud.medications) ? salud.medications : [],
    ...historialCrudo(salud),
  };
}
