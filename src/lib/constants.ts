/**
 * Constantes de rutas Firestore compartidas entre el contexto y los
 * componentes que acceden directamente a subcolecciones de familia.
 *
 * Jerarquía canónica:
 *   Cuentas_Tutor/{uid}
 *     appointments/{id}
 *     documents/{id}
 *     medications/{id}
 *     conversaciones/{convId}
 *       mensajes/{msgId}
 *     Integrantes/{profileId}
 *       historial/registro     ← historial clínico pesado (lazy load)
 *       Documentos/{docId}     ← documentos médicos por integrante
 */

export const COLECCION_TUTOR         = 'Cuentas_Tutor';
export const SUBCOLECCION_INTEGRANTES = 'Integrantes';
export const SUBCOLECCION_HISTORIAL  = 'historial';
export const DOC_HISTORIAL           = 'registro';
export const SUBCOLECCION_CONVERSACIONES = 'conversaciones';

// ─────────────────────────────────────────────────────────
// Token & Payment Collections
// ─────────────────────────────────────────────────────────
export const DOC_TOKENS               = 'tokens';
export const SUBCOLECCION_TRANSACTIONS = 'transactions';

// ─────────────────────────────────────────────────────────
// Growth Agent (herramienta interna, solo fundador)
// ─────────────────────────────────────────────────────────
export const COLECCION_GROWTH_DRAFTS = 'growth_drafts';
