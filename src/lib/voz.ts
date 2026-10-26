/**
 * Reglas de la voz de Hilda: qué se dice en voz alta y con qué voz.
 *
 * Nada de esto toca el navegador: son funciones puras para poder probarlas.
 * El hook `useVozHilda` las usa contra `speechSynthesis`.
 *
 * Por qué la voz del propio teléfono y no una de pago: la app es gratis hasta
 * 1.000 usuarios y una voz por servidor se cobra por carácter en cada consulta.
 * El hook deja el motor cambiable, así que el día que Hilda tenga su voz
 * grabada (la misma de los videos) se sustituye sin tocar las pantallas.
 */

/** Idiomas por orden de preferencia: primero el español de aquí. */
const IDIOMAS = ['es-co', 'es-us', 'es-mx', 'es-419', 'es-ar', 'es-cl', 'es-es'];

/**
 * Pistas de voz femenina en los catálogos de Windows, Android, iOS y Chrome.
 * Es un apaño y se sabe: la API no dice el género. Si ninguna coincide se usa
 * la primera voz en español, que siempre es mejor que ninguna.
 */
const PISTAS_FEMENINAS = ['sabina', 'monica', 'mónica', 'paulina', 'helena', 'laura', 'elvira', 'female', 'mujer'];

export interface VozDisponible {
  name: string;
  lang: string;
  /**
   * Falso cuando el navegador sintetiza en servidor. Lo expone la API web y es
   * la mejor pista de calidad que hay: las voces de servidor son neuronales y
   * suenan a persona; las locales del sistema (SAPI en Windows, eSpeak en
   * Android viejo) suenan a robot de los noventa.
   */
  localService?: boolean;
}

/**
 * Nombres que delatan una voz neuronal. Es un apaño, como el del género: la API
 * no dice qué motor hay detrás. `localService` es más fiable, pero no todos los
 * navegadores lo rellenan bien, así que se miran las dos cosas.
 */
const PISTAS_NATURALES = ['google', 'natural', 'neural', 'online', 'premium', 'enhanced', 'siri'];

function sinTildes(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Elige la mejor voz en español de las que ofrezca el aparato.
 * Devuelve null si no hay ninguna: entonces no se habla, en vez de leer en inglés.
 *
 * El orden de las preferencias importa y está puesto a propósito:
 *
 *  1. **Que suene a persona.** Una voz neuronal con acento de España se escucha
 *     mucho mejor que una robótica con acento de aquí. Quien usa el modo
 *     conversación no va a leer la pantalla: si la voz suena a máquina, la
 *     experiencia se cae entera, y eso pesa más que el acento.
 *  2. **El español más cercano**, entre las que ya suenan bien. En Chrome esto
 *     suele dar "Google español de Estados Unidos", que es de Latinoamérica.
 *  3. **Que sea femenina**, porque Hilda lo es en los videos.
 */
export function elegirVoz<T extends VozDisponible>(voces: T[]): T | null {
  const enEspanol = voces.filter((v) => sinTildes(v.lang).startsWith('es'));
  if (!enEspanol.length) return null;

  const puesto = (v: T) => {
    const i = IDIOMAS.indexOf(sinTildes(v.lang).replace('_', '-'));
    return i === -1 ? IDIOMAS.length : i;
  };
  const esFemenina = (v: T) => PISTAS_FEMENINAS.some((p) => sinTildes(v.name).includes(sinTildes(p)));
  const esNatural = (v: T) =>
    v.localService === false || PISTAS_NATURALES.some((p) => sinTildes(v.name).includes(p));

  return [...enEspanol].sort(
    (a, b) =>
      Number(esNatural(b)) - Number(esNatural(a)) ||
      puesto(a) - puesto(b) ||
      Number(esFemenina(b)) - Number(esFemenina(a))
  )[0];
}

// ─────────────────────────────────────────────────────────────
// Qué se dice en voz alta
// ─────────────────────────────────────────────────────────────

/** "38°C" → "38 grados"; las unidades leídas en letra se entienden mejor. */
const UNIDADES: Array<[RegExp, string]> = [
  [/(\d)\s*°\s*[cC]\b/g, '$1 grados'],
  [/(\d)\s*°/g, '$1 grados'],
  [/\bmg\b/g, 'miligramos'],
  [/\bml\b/g, 'mililitros'],
  [/\bkg\b/g, 'kilos'],
  [/\bh\b/g, 'horas'],
];

/**
 * Deja un mensaje de Hilda listo para decirlo en voz alta.
 *
 * Quita lo que solo tiene sentido en pantalla (asteriscos de negrita, viñetas,
 * almohadillas de título, emojis, enlaces) porque los lectores de voz los
 * pronuncian: "asterisco asterisco importante asterisco asterisco". Lo que no
 * se toca es el contenido clínico: ni se acorta ni se reordena.
 */
export function limpiarParaVoz(texto: string): string {
  if (!texto) return '';
  let t = texto;

  t = t.replace(/```[\s\S]*?```/g, ' ');
  t = t.replace(/`([^`]+)`/g, '$1');
  // Enlaces: se dice el texto, nunca la dirección.
  t = t.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  t = t.replace(/https?:\/\/\S+/g, ' ');
  t = t.replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, '$1');
  t = t.replace(/^\s{0,3}#{1,6}\s*/gm, '');
  // Viñetas y numeración al principio de línea: la pausa la da el punto.
  t = t.replace(/^\s*[-•·*+]\s+/gm, '');
  t = t.replace(/^\s*\d+[.)]\s+/gm, '');
  t = t.replace(/^\s*[-=_]{3,}\s*$/gm, ' ');
  t = t.replace(/^\s*[|│├└─╔═╚║╠]+.*$/gm, ' ');
  // Emojis y símbolos sueltos.
  t = t.replace(/[\u{1F000}-\u{1FAFF}\u{2190}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/gu, ' ');
  for (const [patron, reemplazo] of UNIDADES) t = t.replace(patron, reemplazo);
  // Una línea que se queda sin nada no debe dejar un punto suelto.
  t = t.replace(/[ \t]+/g, ' ');
  t = t.replace(/\n{2,}/g, '\n');
  t = t
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('. ')
    .replace(/\.\s*\./g, '.');

  return t.trim();
}

/** Tope por trozo. Varios motores cortan en seco los textos largos. */
export const MAX_CARACTERES_POR_TROZO = 220;

/**
 * Parte el texto en trozos que el motor pueda decir de corrido, cortando por
 * frases para que la entonación no se rompa a mitad de una idea. Si una frase
 * sola pasa del tope, se corta por palabras.
 */
export function partirParaVoz(texto: string, max = MAX_CARACTERES_POR_TROZO): string[] {
  const limpio = texto.trim();
  if (!limpio) return [];

  // Se corta DESPUÉS del punto, la admiración o la interrogación de cierre.
  // Los signos de apertura (¿ ¡) no separan nada: si se tratan como límite,
  // desaparecen del texto y Hilda pierde la entonación de la pregunta.
  const frases = limpio.match(/[^.!?]+[.!?]*\s*/g) ?? [limpio];
  const trozos: string[] = [];
  let actual = '';

  const empujar = () => {
    if (actual.trim()) trozos.push(actual.trim());
    actual = '';
  };

  for (const frase of frases) {
    if (frase.length > max) {
      empujar();
      let resto = frase.trim();
      while (resto.length > max) {
        const corte = resto.lastIndexOf(' ', max);
        const en = corte > max / 2 ? corte : max;
        trozos.push(resto.slice(0, en).trim());
        resto = resto.slice(en).trim();
      }
      actual = resto;
      continue;
    }
    if ((actual + frase).length > max) empujar();
    actual += frase;
  }
  empujar();

  return trozos.filter(Boolean);
}

// ─────────────────────────────────────────────────────────────
// Ritmo de la conversación
// ─────────────────────────────────────────────────────────────

/**
 * Silencio tras el cual se da por terminado lo que el paciente estaba diciendo.
 *
 * Dos segundos y medio y no uno: una persona mayor, alguien con dificultad para
 * hablar o quien está pensando qué síntoma contar hace pausas largas, y cortarle
 * a mitad de frase es justo lo que este modo viene a evitar.
 */
export const SILENCIO_PARA_ENVIAR_MS = 2500;

/** Velocidad de lectura. Por debajo de 1 porque se le habla a quien no puede leer. */
export const VELOCIDAD_VOZ = 0.95;

/** Lo que se dice al entrar al modo conversación, antes de la primera escucha. */
export const SALUDO_MODO_VOZ = 'Te escucho. Cuéntame qué te pasa.';

/**
 * Las frases de la aplicación que nunca cambian y, por tanto, se pueden
 * sintetizar una vez y guardar. Solo estas: una respuesta de Hilda es distinta
 * en cada consulta —no se repetiría nunca— y además es texto clínico de un
 * paciente, que no tiene por qué quedarse en la memoria del servidor.
 */
export const FRASES_FIJAS: ReadonlySet<string> = new Set([SALUDO_MODO_VOZ]);

/** Un texto demasiado corto suele ser ruido, no una consulta. */
export function valeLaPenaEnviar(texto: string): boolean {
  return texto.trim().replace(/\s+/g, ' ').length >= 2;
}
