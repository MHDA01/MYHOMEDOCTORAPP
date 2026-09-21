import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { COLECCION_TUTOR, SUBCOLECCION_CONVERSACIONES } from '@/lib/constants';
import { decryptField, encryptField } from '@/lib/crypto';
import { ESTADO_INICIAL, type EstadoConsulta } from './tipos';

/**
 * Estado de la consulta entre turnos y traza de cada turno.
 *
 * Viven debajo de la conversación, en rutas que las reglas de Firestore no le
 * abren al teléfono (conversaciones/{id}/agente y conversaciones/{id}/trazas):
 * el paciente no puede borrar una alarma ni alterar la auditoría. Lo clínico va
 * cifrado; en claro solo quedan códigos para medir (motivo, fase, ids de reglas).
 */

export const VERSION_AGENTES = 'hilda-agentes-1';

function conversacion(uid: string, convId: string) {
  return getAdminDb().collection(COLECCION_TUTOR).doc(uid).collection(SUBCOLECCION_CONVERSACIONES).doc(convId);
}

export async function leerEstado(uid: string, convId: string): Promise<EstadoConsulta> {
  const snap = await conversacion(uid, convId).collection('agente').doc('estado').get();
  if (!snap.exists) return { ...ESTADO_INICIAL };
  let detalle: Pick<EstadoConsulta, 'signos' | 'preguntasRespondidas'> = { signos: {}, preguntasRespondidas: [] };
  try {
    const cifrado = snap.get('detalle');
    if (cifrado) detalle = JSON.parse(decryptField(cifrado));
  } catch (error) {
    console.error('[Dra. Hilda] Estado de la consulta ilegible, se reinicia el detalle:', error);
  }
  return {
    motivoId: snap.get('motivo_id') ?? null,
    protocoloVersion: snap.get('protocolo_version') ?? null,
    turnosDeEntrevista: snap.get('turnos_entrevista') ?? 0,
    alarmaActivada: !!snap.get('alarma_activada'),
    signos: detalle.signos ?? {},
    preguntasRespondidas: detalle.preguntasRespondidas ?? [],
  };
}

export async function guardarEstado(uid: string, convId: string, estado: EstadoConsulta): Promise<void> {
  await conversacion(uid, convId)
    .collection('agente')
    .doc('estado')
    .set({
      motivo_id: estado.motivoId,
      protocolo_version: estado.protocoloVersion,
      turnos_entrevista: estado.turnosDeEntrevista,
      alarma_activada: estado.alarmaActivada,
      detalle: encryptField(JSON.stringify({ signos: estado.signos, preguntasRespondidas: estado.preguntasRespondidas })),
      actualizado: FieldValue.serverTimestamp(),
    });
}

export interface Traza {
  fase: string;
  razon: string;
  motivo_id: string | null;
  protocolo_version: number | null;
  signos_disparados: string[];
  signos_por_aclarar: string[];
  preguntas_pendientes: string[];
  lector: { ok: boolean; ms: number; error?: string; modelo: string };
  coincidencias_palabra_clave: string[];
  redactor: { modelo: string | null; intentos: number; fallas: string[] };
  respuesta: 'ia' | 'urgencia' | 'respaldo' | 'error';
  /** Lectura completa (signos con su evidencia): dato de salud, va cifrado. */
  detalle: unknown;
}

/** La traza nunca debe tumbar la respuesta al paciente: si falla, queda en el registro del servidor. */
export async function guardarTraza(uid: string, convId: string, traza: Traza): Promise<void> {
  try {
    const { detalle, ...codigos } = traza;
    await conversacion(uid, convId).collection('trazas').add({
      ...codigos,
      version_agentes: VERSION_AGENTES,
      detalle: encryptField(JSON.stringify(detalle ?? null)),
      creado: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error('[Dra. Hilda] Error guardando la traza del turno:', error);
  }
}
