/**
 * El mensaje de la casa: lo que MyHome DoctorApp dice que es.
 *
 * Lo escribió Alexander el 10-nov-2026 y lo aprobó para todas las pantallas.
 * Vive aquí y no copiado en cada archivo, para que una corrección se haga una
 * sola vez y ninguna pantalla se quede diciendo otra cosa.
 *
 * Dos decisiones que no se tocan sin él:
 *
 * 1. **Hilda es "asistente de salud", nunca "médica".** Su frase original decía
 *    "asistente médica con inteligencia artificial" y él mismo la cambió:
 *    llamarla médica sugiere una profesional donde no la hay. Donde la app
 *    explica qué es —el chat, la portada, la pantalla de acceso, el informe—
 *    sigue en pie la fórmula aprobada: "un personaje creado con inteligencia
 *    artificial".
 * 2. **La consulta profesional se nombra**, por decisión suya del 10-nov-2026,
 *    aun cuando todavía no hay prestador habilitado contratado. Por eso va
 *    siempre con `SALVEDAD`, que es lo que la hace una oferta y no una promesa
 *    incumplible. Si alguna pantalla muestra el propósito sin la salvedad, se
 *    está prometiendo algo que hoy no se puede cumplir.
 */

/** El mensaje completo, para la portada y el material comercial. */
export const PROPOSITO =
  'Queremos que cada hogar tenga un médico más cerca: alguien a quien acudir cuando aparece una duda, ' +
  'un síntoma o una preocupación de salud. Para acercarnos a ese propósito creamos a Hilda, nuestra ' +
  'asistente de salud con inteligencia artificial, y conectamos su orientación con historias clínicas ' +
  'familiares y acceso a una consulta profesional.';

/** La versión de una línea, para metadatos, manifiesto y tiendas. */
export const PROPOSITO_CORTO =
  'Un médico más cerca de cada hogar: orientación con Hilda, nuestra asistente de salud con IA, ' +
  'historias clínicas familiares y acceso a una consulta profesional.';

/**
 * Lo que acompaña al propósito donde la persona lo lee. No es letra menuda de
 * trámite: es lo que separa orientar de atender.
 */
export const SALVEDAD =
  'Hilda es un personaje creado con inteligencia artificial: orienta, no diagnostica ni receta. La ' +
  'consulta profesional depende de un prestador habilitado, su cobertura y su agenda.';
