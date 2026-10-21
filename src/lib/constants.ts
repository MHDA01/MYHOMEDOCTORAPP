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
 *       resumen/medico         ← resumen para el médico, solo lo escribe el servidor
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
// Resumen de la consulta para el médico
// ─────────────────────────────────────────────────────────
// Cuelga de la conversación (así se borra con la cuenta, como todo lo demás),
// pero ninguna regla de Firestore lo alcanza: solo lo lee y lo escribe el
// servidor. Ver firestore.rules y src/app/actions/admin-consultas.ts.
export const SUBCOLECCION_RESUMEN = 'resumen';
export const DOC_RESUMEN_MEDICO   = 'medico';

/** Quién abrió qué consulta y cuándo. Fuera de Cuentas_Tutor: no es dato del paciente. */
export const COLECCION_AUDITORIA = 'auditoria_consultas';

// ─────────────────────────────────────────────────────────
// Token & Payment Collections
// ─────────────────────────────────────────────────────────
export const DOC_TOKENS               = 'tokens';
export const SUBCOLECCION_TRANSACTIONS = 'transactions';

// ─────────────────────────────────────────────────────────
// Modalidad de acceso por cuenta
// ─────────────────────────────────────────────────────────
// Colección propia y fuera de Cuentas_Tutor a propósito: ver src/lib/modalidad-acceso.ts.
export const COLECCION_MODALIDAD = 'acceso_usuarios';

// ─────────────────────────────────────────────────────────
// Growth Agent (herramienta interna, solo fundador)
// ─────────────────────────────────────────────────────────
export const COLECCION_GROWTH_DRAFTS = 'growth_drafts';
