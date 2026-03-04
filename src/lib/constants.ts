/**
 * Constantes de rutas Firestore compartidas entre el contexto y los
 * componentes que acceden directamente a subcolecciones de familia.
 *
 * Jerarquía canónica:
 *   Cuentas_Tutor/{uid}
 *     appointments/{id}
 *     documents/{id}
 *     medications/{id}
 *     Integrantes/{profileId}
 *       historial/registro     ← historial clínico pesado (lazy load)
 *       Documentos/{docId}     ← documentos médicos por integrante
 */

export const COLECCION_TUTOR         = 'Cuentas_Tutor';
export const SUBCOLECCION_INTEGRANTES = 'Integrantes';
export const SUBCOLECCION_HISTORIAL  = 'historial';
export const DOC_HISTORIAL           = 'registro';
