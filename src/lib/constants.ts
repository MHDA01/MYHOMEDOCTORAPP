/**
 * Constantes de rutas Firestore compartidas entre el contexto y los
 * componentes que acceden directamente a subcolecciones de familia.
 *
 * Jerarqu\u00eda can\u00f3nica:
 *   Cuentas_Tutor/{uid}
 *     appointments/{id}
 *     documents/{id}
 *     medications/{id}
 *     conversaciones/{convId}
 *       mensajes/{msgId}
 *     Integrantes/{profileId}
 *       historial/registro     \u2190 historial cl\u00ednico pesado (lazy load)
 *       Documentos/{docId}     \u2190 documentos m\u00e9dicos por integrante
 */

export const COLECCION_TUTOR         = 'Cuentas_Tutor';
export const SUBCOLECCION_INTEGRANTES = 'Integrantes';
export const SUBCOLECCION_HISTORIAL  = 'historial';
export const DOC_HISTORIAL           = 'registro';
export const SUBCOLECCION_CONVERSACIONES = 'conversaciones';
