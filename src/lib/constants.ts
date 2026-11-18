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
// Ficha clínica por integrante (la raíz del grafo)
// ─────────────────────────────────────────────────────────
// Fuera de Cuentas_Tutor por la misma razón que la modalidad, y con más
// motivo: bajo `Integrantes/{id}` hay un comodín RECURSIVO (`{path=**}`) que
// le da escritura al dueño sobre todo lo que cuelgue de ahí, y en un comodín
// recursivo no se puede excluir una subcolección como sí se hace con `tokens`.
// La ficha son antecedentes tipados que solo escribe el servidor después de
// validarlos: si el navegador pudiera escribirla, se saltaría `registrar()` y
// con él la regla de que todo hallazgo traiga la frase de la que salió.
// Se borra con la cuenta desde `datos-de-la-cuenta.ts`, como la modalidad.
export const COLECCION_FICHAS = 'fichas_clinicas';
export const SUBCOLECCION_FICHAS_INTEGRANTES = 'integrantes';
// Los hallazgos de HOY de una consulta. Cuelgan de `fichas_clinicas/{uid}` para
// heredar su `allow read, write: if false` y su borrado con la cuenta, pero son
// otra cosa que la ficha: la ficha es lo estable de la persona y esto es el
// episodio. Mezclarlos convertiría la ficha en un diario y la próxima consulta
// arrancaría con el dolor de la anterior como si siguiera.
export const SUBCOLECCION_EPISODIOS = 'episodios';

// ─────────────────────────────────────────────────────────
// Growth Agent (herramienta interna, solo fundador)
// ─────────────────────────────────────────────────────────
export const COLECCION_GROWTH_DRAFTS = 'growth_drafts';
