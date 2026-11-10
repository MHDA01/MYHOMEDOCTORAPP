// ============================================================
// lib/extractor.ts — De lo que la persona dijo a hallazgos tipados
// ============================================================
//
// Es el paso 5 del orden de construcción y **la única pieza del grafo que
// necesita el modelo**. Todo lo demás —el ejecutor, las reglas, las alarmas— es
// código determinista. Por eso aquí la regla es estricta:
//
//   El modelo PROPONE. El código DECIDE qué entra.
//
// Nada de lo que el modelo devuelve se cree directamente. Cada propuesta pasa
// por `registrar()` de `hallazgos.ts`, que es el único camino por el que un
// hallazgo puede existir, y antes por la comprobación de abajo, que `registrar`
// no puede hacer.
//
// ── LA DEFENSA QUE FALTABA ──
//
// `registrar()` exige que todo lo que venga del relato traiga la frase de la
// que salió, porque "esa frase es la prueba de que alguien lo dijo". Pero solo
// puede comprobar que la frase **no esté vacía**: no tiene delante la
// conversación, así que no sabe si existe.
//
// Un modelo puede inventarse la cita tan fácilmente como el dato. Así que aquí
// se comprueba que la frase **aparezca de verdad en lo que la persona escribió**
// (`frasePropia`). Una cita que no está en la conversación es exactamente la
// forma que tiene una alucinación de parecer evidencia, y se rechaza.
//
// ── LO QUE EL EXTRACTOR NO HACE ──
//
// - **No decide conducta.** No dice si algo es urgente, no asigna nivel de
//   atención y no dispara alarmas. Eso corre después, en el ejecutor, sobre los
//   hallazgos que aquí se aceptaron.
// - **No infiere.** Si la persona no dijo que fuma, no se escribe `negado`: se
//   queda `no_preguntado`, que es ausente. Son cosas distintas y la diferencia
//   es la regla 1 del diseño.
// - **No reclasifica.** "Ibuprofeno" no se convierte en "AINE"; la sustancia
//   viaja como la dijo la persona.
// - **No calcula.** Los derivados (el IMC) los hace el código con `imc()`, y
//   `registrar` rechaza que lleguen de fuera.
//
// Por eso este trabajo admite un modelo barato y sin razonamiento: no está
// juzgando nada, está convirtiendo texto en campos con un molde cerrado.

import { generateWithGemini, DEFAULT_GEMINI_MODEL } from '@/lib/gemini';
import { normalizarValor } from '@/lib/normalizar-valor';
import {
  HALLAZGOS,
  definicion,
  registrar,
  type DefinicionHallazgo,
  type EntradaHallazgo,
  type HallazgoRegistrado,
  type Temporalidad,
} from '@/lib/hallazgos';

/** Lo que el modelo propone, antes de que el código lo acepte o lo rechace. */
export interface Propuesta {
  id?: unknown;
  estado?: unknown;
  /** Siempre texto: ver `PorQueTodoEsTexto` en el esquema. */
  valor?: unknown;
  frase?: unknown;
  temporalidad?: unknown;
  razon?: unknown;
  minimizado?: unknown;
  ambiguo?: unknown;
}

export interface Descartada {
  propuesta: Propuesta;
  motivo: string;
}

export interface Extraccion {
  aceptados: HallazgoRegistrado[];
  descartadas: Descartada[];
}

// ─────────────────────────────────────────────────────────────
// Qué se le puede pedir al modelo
// ─────────────────────────────────────────────────────────────

/**
 * Los hallazgos que tiene sentido sacar de una conversación.
 *
 * Quedan fuera dos grupos, y por motivos distintos:
 *
 * - Los **derivados**: los calcula el código y `registrar` los rechaza si
 *   llegan de fuera. Ofrecérselos al modelo sería invitarlo a un error.
 * - Los de **origen `ficha`**: la edad, el sexo. No salen de lo que alguien
 *   cuenta en el chat, salen del perfil. Si el modelo pudiera escribirlos,
 *   podría pisar con una suposición un dato que ya estaba bien.
 */
export function hallazgosExtraibles(): DefinicionHallazgo[] {
  return HALLAZGOS.filter((h) => h.tipo.clase !== 'derivado' && h.origen !== 'ficha');
}

/**
 * El molde que el modelo debe llenar, en el subconjunto de OpenAPI que acepta
 * Gemini (`responseSchema` en `lib/gemini.ts`).
 *
 * **Por qué `valor` es siempre texto.** Un hallazgo puede valer un número, una
 * categoría o una frase, y el esquema de Gemini no lleva bien las uniones: con
 * un `anyOf` el modelo devuelve cualquier cosa o nada. Es más seguro pedir
 * texto siempre y convertirlo aquí según la clase del hallazgo, donde el molde
 * se conoce y el error se puede explicar. Si la conversión falla, la propuesta
 * se descarta con su motivo en vez de colarse mal tipada.
 */
export function esquemaDeExtraccion(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      hallazgos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', enum: hallazgosExtraibles().map((h) => h.id) },
            // `no_preguntado` no está: no es algo que se extraiga, es la
            // ausencia. Escribirlo sería afirmar que no se preguntó.
            estado: { type: 'string', enum: ['positivo', 'negado', 'desconocido'] },
            valor: { type: 'string' },
            frase: { type: 'string' },
            temporalidad: { type: 'string', enum: ['actual', 'antecedente'] },
            razon: { type: 'string' },
            minimizado: { type: 'boolean' },
            ambiguo: { type: 'boolean' },
          },
          required: ['id', 'estado', 'frase', 'temporalidad'],
        },
      },
    },
    required: ['hallazgos'],
  };
}

/**
 * El molde de cada hallazgo, en una línea, **generado del catálogo**.
 *
 * Sin esto el modelo adivina el formato a ciegas: el esquema de Gemini declara
 * `valor` como texto para todos los ids (no admite un enum distinto por id), así
 * que las opciones de `caracter` o la unidad de `talla` no viajan en el esquema
 * y hay que decirlas aquí. Medido el 9-nov-2026: sin el molde se perdía el 40 %
 * de las propuestas buenas por formato.
 *
 * Se genera y no se escribe a mano para que añadir una fila al catálogo no deje
 * la instrucción mintiendo. Cuesta unos 500 tokens de entrada por turno: COP
 * 0,48 con Flash-Lite, contra los COP 99 que cuesta volver a preguntar.
 */
export function moldeDeLosHallazgos(): string {
  return hallazgosExtraibles()
    .map((h) => {
      const t = h.tipo;
      const como =
        t.clase === 'presencia'
          ? 'sin valor, el estado lo dice todo'
          : t.clase === 'texto'
            ? 'texto, en las palabras de la persona'
            : t.clase === 'categoria'
              ? `una de: ${t.opciones.join(', ')}`
              : t.clase === 'escala'
                ? `número entero de ${t.min} a ${t.max}`
                : t.clase === 'entero'
                  ? `número entero en ${t.unidad ?? 'unidades'} (${t.min} a ${t.max})`
                  : t.clase === 'numero'
                    ? `número en ${t.unidad} (${t.min} a ${t.max})`
                    // `hallazgosExtraibles` ya quitó los derivados; el tipo no lo sabe.
                    : 'no se extrae';
      return `- ${h.id} (${h.nombreClinico}): ${como}`;
    })
    .join('\n');
}

/**
 * Lo que se le pide al modelo. Es instrucción de extracción, no texto clínico:
 * no la lee ningún paciente y no decide ninguna conducta.
 */
export const INSTRUCCION_EXTRACTOR = `Extrae de la conversación los hallazgos clínicos que la PERSONA dijo explícitamente.

Reglas, en orden de importancia:
1. Copia en "frase" las palabras EXACTAS de la persona de las que sacas cada hallazgo. Si no puedes citar la frase literal, no lo incluyas.
2. No infieras nada. Si la persona no habló de algo, no lo incluyas: no existe "no lo mencionó, luego no lo tiene".
3. No reclasifiques. Si dijo "ibuprofeno", el valor es "ibuprofeno", no "AINE".
4. "temporalidad": "actual" si le está pasando ahora, "antecedente" si lo cuenta del pasado. "Se me hinchó la cara hace cinco años" es antecedente; "se me está hinchando" es actual.
5. "estado": "positivo" si lo afirma, "negado" si lo niega, "desconocido" si dice que no lo sabe (y entonces explica en "razon" por qué no lo sabe).
6. Marca "minimizado" si lo contó restándole importancia ("un dolorcito", "nada serio").
7. Marca "ambiguo" si la frase admite dos lecturas.
8. No incluyas nada que haya dicho Hilda. Solo lo que dijo la persona.
9. En "valor" usa EXACTAMENTE el formato que pide la lista de abajo: solo el número sin la unidad ni palabras ("7", no "7 de 10"; "82", no "82 kilos"), o una de las opciones tal como están escritas ("opresivo", no "como un peso"). Si el hallazgo no lleva valor, no mandes "valor".
10. Si es una medición y la persona dio el número, el estado es "positivo" y el valor es ese número. No juzgues si el número es normal o alto: 36.8 de temperatura es un valor medido, no una negación.

Formato de cada hallazgo:
${moldeDeLosHallazgos()}`;

// ─────────────────────────────────────────────────────────────
// La comprobación que `registrar` no puede hacer
// ─────────────────────────────────────────────────────────────

/**
 * Normaliza para comparar: minúsculas, sin tildes y con los espacios
 * colapsados. No se normaliza la puntuación porque lo que se busca es una cita
 * inventada, no una diferencia de transcripción.
 */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * ¿La frase está de verdad en lo que la persona dijo?
 *
 * Es la defensa contra la cita inventada. Se compara solo contra los turnos de
 * la PERSONA, nunca contra los de Hilda: si Hilda nombró la disnea al
 * preguntar, citarla a ella no prueba que el paciente la tenga.
 */
export function frasePropia(frase: string, dichoPorLaPersona: readonly string[]): boolean {
  const aguja = normalizar(frase);
  if (!aguja) return false;
  return dichoPorLaPersona.some((turno) => normalizar(turno).includes(aguja));
}

// ─────────────────────────────────────────────────────────────
// Del molde del modelo al hallazgo registrado
// ─────────────────────────────────────────────────────────────

const ESTADOS_QUE_SE_EXTRAEN = new Set(['positivo', 'negado', 'desconocido']);
const TEMPORALIDADES_VALIDAS = new Set(['actual', 'antecedente']);

/**
 * Convierte lo que el modelo propuso en hallazgos registrados, descartando con
 * motivo todo lo que no supere las comprobaciones.
 *
 * `dichoPorLaPersona` son los turnos del paciente, tal como se guardaron. No se
 * le pasan los de Hilda a propósito: ver `frasePropia`.
 *
 * Nunca lanza. Un extractor que falla a menudo es lo normal —frases ambiguas,
 * unidades que no cuadran, datos que nadie dio— y un `motivo` legible por cada
 * descarte es lo que permite revisar después si el modelo está entendiendo mal
 * o si es la persona la que no fue clara.
 */
export function interpretar(
  propuestas: readonly Propuesta[] | undefined,
  dichoPorLaPersona: readonly string[],
  fecha: string
): Extraccion {
  const aceptados: HallazgoRegistrado[] = [];
  const descartadas: Descartada[] = [];
  const descartar = (propuesta: Propuesta, motivo: string) => descartadas.push({ propuesta, motivo });

  for (const propuesta of propuestas ?? []) {
    const id = typeof propuesta?.id === 'string' ? propuesta.id : '';
    const def = definicion(id);
    if (!def) {
      descartar(propuesta, `"${id}" no está en el vocabulario de hallazgos`);
      continue;
    }
    // Lo que el esquema no deja pedir, tampoco se acepta si llega: un modelo
    // puede devolver algo fuera del molde aunque se le haya dado uno.
    if (def.tipo.clase === 'derivado' || def.origen === 'ficha') {
      descartar(propuesta, `"${id}" no se extrae de la conversación`);
      continue;
    }

    const estado = String(propuesta?.estado ?? '');
    if (!ESTADOS_QUE_SE_EXTRAEN.has(estado)) {
      descartar(propuesta, `"${estado}" no es un estado que se pueda extraer`);
      continue;
    }

    const frase = typeof propuesta?.frase === 'string' ? propuesta.frase : '';
    if (!frasePropia(frase, dichoPorLaPersona)) {
      // El descarte más importante de todos.
      descartar(propuesta, `la frase citada no aparece en lo que dijo la persona: "${frase}"`);
      continue;
    }

    const temporalidad = String(propuesta?.temporalidad ?? '');
    if (!TEMPORALIDADES_VALIDAS.has(temporalidad)) {
      descartar(propuesta, `"${temporalidad}" no es una temporalidad válida`);
      continue;
    }

    // Acerca el valor al molde ("7 de 10" → 7, "como un peso" → opresivo) sin
    // adivinar: lo que no se puede convertir con certeza se descarta.
    const tipado = normalizarValor(def, propuesta?.valor);
    if (!tipado.ok) {
      descartar(propuesta, tipado.motivo);
      continue;
    }

    const entrada: EntradaHallazgo = {
      id,
      estado: estado as EntradaHallazgo['estado'],
      procedencia: 'relato',
      frase,
      fecha,
      temporalidad: temporalidad as Temporalidad,
    };
    if (tipado.valor !== undefined) entrada.valor = tipado.valor as EntradaHallazgo['valor'];
    if (typeof propuesta?.razon === 'string' && propuesta.razon.trim()) entrada.razon = propuesta.razon.trim();
    if (propuesta?.minimizado === true) entrada.minimizado = true;
    if (propuesta?.ambiguo === true) entrada.ambiguo = true;

    // La última palabra la tiene `registrar`: es el único camino por el que un
    // hallazgo puede existir, y aquí no se esquiva.
    const registro = registrar(entrada);
    if (registro.ok) aceptados.push(registro.hallazgo);
    else descartar(propuesta, registro.motivo);
  }

  return { aceptados, descartadas };
}

// ─────────────────────────────────────────────────────────────
// La llamada al modelo
// ─────────────────────────────────────────────────────────────

/**
 * El modelo del extractor, aparte del de la conversación a propósito.
 *
 * Extraer no es conversar: aquí no hay tono que cuidar ni decisión que tomar,
 * solo texto que convertir en campos con un molde cerrado y con todas las
 * salidas validadas por código. Es justo el trabajo que admite un modelo
 * barato, y tenerlo en su propia variable permite probar Flash-Lite aquí sin
 * tocar la conversación, que es donde sí importa la calidad.
 */
const MODELO_EXTRACTOR = process.env.EXTRACTOR_MODEL || DEFAULT_GEMINI_MODEL;

/** Vacío: lo que devuelve un extractor que no pudo trabajar. */
const NADA: Extraccion = { aceptados: [], descartadas: [] };

/**
 * Saca los hallazgos de lo que la persona dijo en la consulta.
 *
 * `dichoPorLaPersona` son sus turnos, sin los de Hilda: lo que ella preguntó no
 * es un hallazgo, y mezclarlos dejaría que una cita de la pregunta pasara por
 * respuesta.
 *
 * **Nunca lanza, y nunca interrumpe la consulta.** Si el modelo falla, si
 * devuelve algo que no es JSON o si no hay clave configurada, se devuelve una
 * extracción vacía: la orientación sigue exactamente igual que antes de que
 * esto existiera. Un extractor caído deja la ficha sin enriquecer, que es un
 * problema de mañana; tumbar la consulta es un problema de ahora.
 *
 * Sin razonamiento y con temperatura baja: no hay nada que deliberar, y la
 * creatividad aquí es exactamente el defecto que `interpretar` tiene que
 * atrapar después.
 */
export async function extraerHallazgos(
  dichoPorLaPersona: readonly string[],
  fecha: string
): Promise<Extraccion> {
  const turnos = dichoPorLaPersona.filter((t) => typeof t === 'string' && t.trim());
  if (!turnos.length) return NADA;

  const resultado = await generateWithGemini({
    system: INSTRUCCION_EXTRACTOR,
    contents: [
      {
        role: 'user',
        parts: [{ text: turnos.map((t, i) => `(${i + 1}) ${t}`).join('\n') }],
      },
    ],
    model: MODELO_EXTRACTOR,
    responseSchema: esquemaDeExtraccion(),
    temperature: 0,
    thinkingBudget: 0,
    nativo: true,
    maxTokens: 2048,
    timeoutMs: 20_000,
  });

  if (!resultado.ok) {
    console.log(`[Extractor] Sin hallazgos (${resultado.kind}): ${resultado.detail.slice(0, 200)}`);
    return NADA;
  }

  let propuestas: Propuesta[] | undefined;
  try {
    // El esquema no es una garantía: hay que volver a validar lo que llega.
    propuestas = JSON.parse(resultado.text)?.hallazgos;
  } catch {
    console.log('[Extractor] La respuesta no era JSON; no se extrae nada este turno');
    return NADA;
  }
  if (!Array.isArray(propuestas)) return NADA;

  const extraccion = interpretar(propuestas, turnos, fecha);
  // Lo descartado se registra: es como se sabe si el modelo está entendiendo
  // mal o si es la persona la que no fue clara. Sin la palabra "Error", que es
  // por lo que filtra la alerta de Cloud Run: esto es información.
  if (extraccion.descartadas.length) {
    console.log(
      `[Extractor] ${extraccion.aceptados.length} aceptados, ${extraccion.descartadas.length} descartados: ` +
        extraccion.descartadas.map((d) => d.motivo).join(' | ').slice(0, 400)
    );
  }
  return extraccion;
}
