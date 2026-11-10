// ============================================================
// lib/normalizar-valor.ts — De como lo dice la gente a como lo pide el molde
// ============================================================
//
// El extractor pierde hallazgos buenos por formato. Medido el 9-nov-2026 sobre
// seis conversaciones: de cada diez propuestas que el modelo hacía bien, cuatro
// se caían en la validación. No por estar equivocadas: por venir dichas como
// las dice la gente.
//
//   "7 de 10"              → intensidad espera un número
//   "82 kilos"             → peso espera un número
//   "1.62"                 → talla está fuera del rango (20 a 250 cm)
//   "desde ayer"           → dias_de_evolucion espera un número
//   "como un peso"         → no es una opción de caracter
//
// En un dolor torácico eso significa perder el carácter, la intensidad y el
// tiempo de evolución: tres de los campos que más valen. El modelo no tiene la
// culpa —nunca se le dijo el molde— pero aunque se le diga, la gente va a
// seguir hablando así, y el número tiene que salir de la frase igual.
//
// ── LA REGLA ──
//
//   Si no se puede convertir con certeza, se descarta. Nunca se adivina.
//
// Un hallazgo perdido se vuelve a preguntar. Un hallazgo inventado entra a la
// historia clínica de alguien. No son el mismo error y no se tratan igual.
//
// Por eso aquí no hay ningún caso por defecto: nada cae en `otro`, nada se
// aproxima, nada se redondea desde una expresión vaga. "Hace un rato" no es un
// número de días y se queda sin convertir.
//
// ── POR QUÉ ESTO ES CÓDIGO Y NO PROMPT ──
//
// Las equivalencias son una tabla que un médico puede leer, discutir y corregir
// línea por línea, y que se comporta igual en todas las corridas. Dejárselas al
// modelo sería volver a inventarlas en cada turno, sin que nadie las vea.
//
// ── OJO: LA TABLA DE `caracter` ES VOCABULARIO CLÍNICO ──
//
// Decir que "como un peso" es `opresivo` es una equivalencia clínica, no una de
// formato, y en el dolor torácico esa palabra pesa. Está escrita aquí para que
// se pueda revisar; la aprueba el médico responsable. Mientras tanto el
// hallazgo guarda SIEMPRE la frase literal de la persona (`frase` en
// `HallazgoRegistrado`), así que lo que ella dijo nunca se pierde detrás de la
// categoría.

import type { DefinicionHallazgo } from '@/lib/hallazgos';

/** Minúsculas, sin tildes, espacios colapsados. */
function plano(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// ─────────────────────────────────────────────────────────────
// Números dichos en palabras
// ─────────────────────────────────────────────────────────────

/**
 * "un" y "una" NO están aquí, y la omisión es el arreglo de un error medido:
 * en "un 7 de 10" el artículo ganaba al dígito y la intensidad quedaba en 1.
 * Registrar 1 donde la persona dijo 7 es peor que no registrar nada.
 *
 * En español "un" es casi siempre artículo, no cuenta. Donde sí cuenta —"un
 * mes", "una semana"— lo resuelve `diasDeEvolucion` con la unidad, que es el
 * único sitio donde esa lectura es inequívoca.
 */
const EN_PALABRAS: Record<string, number> = {
  cero: 0, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
  trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
  dieciocho: 18, diecinueve: 19, veinte: 20, treinta: 30, cuarenta: 40,
  cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100,
};

/**
 * El primer número del texto, en dígitos o en palabras.
 *
 * `"un 7 de 10"` da 7 y no 10 porque el primero es el que la persona declaró;
 * el segundo es el tope de la escala que ella misma nombró.
 */
export function primerNumero(texto: string): number | null {
  const t = plano(texto);

  const digitos = t.match(/-?\d+(?:[.,]\d+)?/);
  const palabra = t.match(
    /\b(cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciseis|diecisiete|dieciocho|diecinueve|veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien)\b/
  );

  // Gana el que aparezca primero en la frase: "dos semanas y 3 días" es 2.
  const iDigitos = digitos?.index ?? Infinity;
  const iPalabra = palabra?.index ?? Infinity;
  if (iDigitos === Infinity && iPalabra === Infinity) return null;

  if (iDigitos <= iPalabra) {
    const n = Number(digitos![0].replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return EN_PALABRAS[palabra![1]] ?? null;
}

// ─────────────────────────────────────────────────────────────
// Tiempo de evolución: de como se cuenta a días
// ─────────────────────────────────────────────────────────────

/** Expresiones que valen un número exacto de días por sí solas. */
const DIAS_EXACTOS: Array<[RegExp, number]> = [
  [/\bhoy\b|\besta manana\b|\besta tarde\b|\besta noche\b|\bhace un rato\b.*\bhoy\b/, 0],
  [/\banoche\b|\bayer\b/, 1],
  [/\banteayer\b|\bantier\b|\bantes de ayer\b/, 2],
];

/** Unidades de tiempo y cuántos días vale cada una. */
const DIAS_POR_UNIDAD: Array<[RegExp, number]> = [
  [/\bdias?\b|\bdia\b/, 1],
  [/\bsemanas?\b/, 7],
  [/\bmes(es)?\b/, 30],
  [/\banos?\b/, 365],
  [/\bhoras?\b/, 0], // menos de un día: el entero en días es 0, no se descarta.
];

/**
 * Días de evolución a partir de como lo cuenta la gente.
 *
 * `null` cuando no hay forma de saberlo: "hace tiempo", "hace rato", "desde
 * siempre". Un tiempo de evolución inventado cambia la clasificación del
 * padecimiento, así que la ausencia es la respuesta correcta.
 */
export function diasDeEvolucion(texto: string): number | null {
  const t = plano(texto);

  // Un número con su unidad manda sobre todo: "hace dos semanas".
  const n = primerNumero(t);
  if (n !== null && n >= 0) {
    for (const [patron, dias] of DIAS_POR_UNIDAD) {
      if (patron.test(t)) return Math.round(n * dias);
    }
  }

  // Sin unidad, las expresiones cerradas: "desde ayer en la tarde".
  for (const [patron, dias] of DIAS_EXACTOS) {
    if (patron.test(t)) return dias;
  }

  // "una semana", "un mes": la unidad sin número explícito vale una.
  for (const [patron, dias] of DIAS_POR_UNIDAD) {
    if (dias > 0 && patron.test(t) && /\b(un|una)\b/.test(t)) return dias;
  }

  // Un número pelado solo se acepta si el campo ya es de días.
  if (n !== null && n >= 0 && !/[a-z]/.test(t.replace(/[^a-z]/g, ''))) return Math.round(n);

  return null;
}

// ─────────────────────────────────────────────────────────────
// Categorías: las palabras de la gente y la opción que les corresponde
// ─────────────────────────────────────────────────────────────

/**
 * Por hallazgo, los patrones que llevan a cada opción. El orden importa: gana
 * el primero que coincida, así que lo más específico va arriba.
 *
 * Lo que no coincide NO cae en ninguna opción. En particular nada cae en
 * `otro`: decir `otro` es afirmar que no es ninguna de las demás, y eso solo lo
 * puede afirmar quien entendió la frase.
 */
const SINONIMOS: Record<string, Array<[RegExp, string]>> = {
  // ⚠ Vocabulario clínico. Pendiente de aprobación del médico responsable.
  caracter: [
    [/\bpunza|\bpuntada|\bpinchaz|\bclavad|\baguja/, 'punzante'],
    [/\bpeso\b|\bpesad|\bopres|\bapriet|\baprieta|\bapretad|\bpresion\b|\bcomo si me (apretaran|sentara)/, 'opresivo'],
    [/\bard(e|or|iendo)|\bquem|\bacidez|\bagriera|\bfuego/, 'ardor'],
    [/\bcolic|\bretorcij|\bretortij|\bcalambre\b|\bpor oleadas\b/, 'colico'],
  ],
  patron_temporal: [
    [/\bconstante|\btodo el (tiempo|dia)|\bsiempre\b|\bno se me quita|\bpermanente|\bsin parar\b/, 'continuo'],
    [/\bintermitente|\ba veces\b|\bpor ratos\b|\bpor momentos\b|\bva y viene\b|\bde vez en cuando\b|\ben ocasiones\b|\bsolo (en|por) la (manana|tarde|noche)\b|\bsobre todo (en|por) la (manana|tarde|noche)\b/, 'intermitente'],
    [/\brecurrente|\bvuelve\b|\bse repite\b|\bcada (tanto|mes|semana|ano)\b|\bpor temporadas\b/, 'recurrente'],
  ],
  cambio_de_peso: [
    [/\bsin cambio|\bigual\b|\blo mismo\b|\bno he (subido|bajado|perdido|ganado)|\bni he (subido|bajado)/, 'sin_cambio'],
    [/\bbaj(e|ado|ando)\b|\bperd(i|ido|iendo)\b|\badelgaz|\bmas flaco|\bmas delgad|\bdisminu/, 'disminucion'],
    [/\bsub(i|ido|iendo)\b|\bengord|\bgan(e|ado)\b|\baument|\bmas gordo|\bmas pesad/, 'aumento'],
  ],
  mecanismo: [
    [/\bgolpe\b|\bme ca(i|ida)|\bcaida\b|\baccidente\b|\bchoque\b|\btrauma|\bme pegu/, 'traumatico'],
    [/\besfuerzo\b|\bhaciendo fuerza\b|\bcargando\b|\blevant(e|ando)\b|\bcorriendo\b|\bsubiendo escaleras\b|\bhaciendo ejercicio\b/, 'esfuerzo'],
  ],
  curso_clinico: [
    [/\bprogresi|\bpeor cada|\bempeorando|\bva empeorando|\bcada vez (mas|peor)/, 'progresivo'],
    [/\bestacionario|\bigual que (el primer dia|siempre)|\bno ha cambiado|\bsigue igual/, 'estacionario'],
    [/\bregresi|\bmejorando|\bva mejorando|\bcada vez menos|\bya casi no/, 'regresivo'],
  ],
  sexo_registrado: [
    [/\bmasculin|\bhombre\b|\bvaron\b/, 'masculino'],
    [/\bfemenin|\bmujer\b/, 'femenino'],
  ],
};

/**
 * La opción del catálogo que corresponde a lo que dijo la persona, o `null`.
 *
 * Si el texto ya ES una de las opciones, se devuelve tal cual: la tabla no se
 * interpone cuando el modelo acertó.
 */
export function categoriaDe(def: DefinicionHallazgo, texto: string): string | null {
  if (def.tipo.clase !== 'categoria') return null;
  const t = plano(texto);

  const exacta = def.tipo.opciones.find((o) => plano(o) === t);
  if (exacta) return exacta;

  for (const [patron, opcion] of SINONIMOS[def.id] ?? []) {
    if (patron.test(t)) {
      // Nunca se devuelve una opción que el catálogo no tenga: la tabla y el
      // catálogo pueden desalinearse al editar uno de los dos.
      return def.tipo.opciones.includes(opcion) ? opcion : null;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// Mediciones: unidades que la gente mezcla
// ─────────────────────────────────────────────────────────────

/**
 * Talla: el catálogo la pide en centímetros y la gente la dice en metros.
 *
 * El corte en 3 no es arbitrario: no hay persona de 3 cm ni de 3 m, así que
 * cualquier valor por debajo son metros y cualquiera por encima, centímetros.
 * Se resuelve por el rango y no por la palabra "metros", que muchas veces no
 * está ("mido 1.62").
 */
function tallaACentimetros(n: number): number {
  return n > 0 && n < 3 ? Math.round(n * 100) : n;
}

/** Temperatura: si viene en Fahrenheit, a Celsius. El rango del catálogo es 33 a 43. */
function temperaturaACelsius(n: number): number {
  return n >= 90 && n <= 110 ? Math.round(((n - 32) / 1.8) * 10) / 10 : n;
}

// ─────────────────────────────────────────────────────────────
// La entrada única
// ─────────────────────────────────────────────────────────────

export type Normalizado =
  | { ok: true; valor?: string | number }
  | { ok: false; motivo: string };

/**
 * Convierte el `valor` que propuso el modelo a lo que el molde del hallazgo
 * espera, o explica por qué no se pudo.
 *
 * Se llama desde `interpretar()` y su salida sigue pasando por `registrar()`:
 * esto acerca el valor al molde, no reemplaza la validación. Si normalizar
 * produce algo fuera de rango, `registrar` lo rechaza igual.
 */
export function normalizarValor(def: DefinicionHallazgo, crudo: unknown): Normalizado {
  const t = def.tipo;
  if (t.clase === 'presencia') return { ok: true };
  if (crudo === undefined || crudo === null || String(crudo).trim() === '') return { ok: true };

  const texto = String(crudo).trim();

  // El texto viaja como lo dijo la persona. No se normaliza: es el campo donde
  // la regla "no reclasifiques" aplica entera.
  if (t.clase === 'texto') return { ok: true, valor: texto };

  if (t.clase === 'categoria') {
    const opcion = categoriaDe(def, texto);
    if (opcion) return { ok: true, valor: opcion };
    return {
      ok: false,
      motivo: `"${texto}" no se pudo llevar a una opción de "${def.id}" (${t.opciones.join(', ')})`,
    };
  }

  if (t.clase === 'derivado') {
    return { ok: false, motivo: `"${def.id}" es derivado: solo lo calcula el código` };
  }

  // dias_de_evolucion tiene su propio lector: "desde ayer" no es un número
  // pero sí es un tiempo de evolución.
  if (def.id === 'dias_de_evolucion') {
    const dias = diasDeEvolucion(texto);
    if (dias === null) {
      return { ok: false, motivo: `"${texto}" no dice cuántos días de evolución son` };
    }
    return { ok: true, valor: dias };
  }

  let n = primerNumero(texto);
  if (n === null) return { ok: false, motivo: `"${def.id}" espera un número y llegó "${texto}"` };

  if (def.id === 'talla') n = tallaACentimetros(n);
  if (def.id === 'fiebre_medida') n = temperaturaACelsius(n);
  if (t.clase === 'entero' || t.clase === 'escala') n = Math.round(n);

  return { ok: true, valor: n };
}
