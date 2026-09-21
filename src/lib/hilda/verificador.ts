import { normalizar } from './alarmas-universales';
import type { Fase, FraseProtocolo } from './tipos';

/**
 * Verificador de salida: revisa cada respuesta de la IA antes de que llegue al
 * paciente. Solo reglas fijas (rápidas y sin costo). Si algo falla, la respuesta
 * se regenera una vez con la corrección; si vuelve a fallar, sale un texto de
 * respaldo aprobado (ver textos-agentes.ts).
 */

export type CodigoFalla =
  | 'dosis'
  | 'medicamento'
  | 'diagnostico_afirmado'
  | 'norma_derogada'
  | 'sin_pregunta'
  | 'sin_aviso_urgencias'
  /** El segundo intento de la IA ni siquiera respondió. */
  | 'error_redactor';

export interface Falla {
  codigo: CodigoFalla;
  detalle: string;
}

const DOSIS = /\b\d+(?:[.,]\d+)?\s?(?:mg|mcg|µg|g|ml|cc|ui|gotas|tabletas?|capsulas?|sobres?|cucharadas?|cucharaditas?)\b/;

/**
 * Medicamentos de uso frecuente en Colombia, sin tildes. Nombrarlos no es falla
 * por sí mismo ("no le des antibióticos sin fórmula"): lo es cuando la frase no
 * lo niega ni remite al médico, y la frase no viene de un protocolo aprobado.
 */
const MEDICAMENTOS = [
  'acetaminofen', 'paracetamol', 'ibuprofeno', 'naproxeno', 'diclofenaco', 'aspirina', 'acido acetilsalicilico',
  'dipirona', 'metamizol', 'ketorolaco', 'tramadol', 'codeina', 'loratadina', 'cetirizina', 'clorfeniramina',
  'amoxicilina', 'azitromicina', 'cefalexina', 'ciprofloxacino', 'metronidazol', 'trimetoprim', 'nitrofurantoina',
  'omeprazol', 'esomeprazol', 'ranitidina', 'loperamida', 'metoclopramida', 'ondansetron', 'dimenhidrinato',
  'salbutamol', 'beclometasona', 'budesonida', 'prednisolona', 'prednisona', 'dexametasona', 'betametasona',
  'losartan', 'enalapril', 'amlodipino', 'hidroclorotiazida', 'metformina', 'insulina', 'glibenclamida',
  'sertralina', 'fluoxetina', 'clonazepam', 'alprazolam', 'lorazepam', 'zinc', 'suero oral', 'sales de rehidratacion',
  'antibiotico', 'antiinflamatorio', 'analgesico', 'antihistaminico', 'antidiarreico', 'antiemetico', 'jarabe',
];

/** Frases que niegan, prohíben o remiten al médico: ahí nombrar un medicamento está bien. */
const CONTEXTO_SEGURO = /\b(no|nunca|evita|evitar|sin formula|sin receta|sin prescripcion|consulta|consultar|pregunta|medico|profesional|automedi|prescri|formul)/;

const DIAGNOSTICOS = [
  'infeccion', 'neumonia', 'bronquiolitis', 'dengue', 'asma', 'diabetes', 'hipertension', 'infarto', 'preeclampsia',
  'gastroenteritis', 'apendicitis', 'covid', 'gripa', 'influenza', 'migrana', 'otitis', 'amigdalitis', 'faringitis',
  'infeccion urinaria', 'cistitis', 'sinusitis', 'bronquitis', 'colico', 'cancer', 'tumor', 'ataque cerebrovascular', 'acv',
];

/** "tienes neumonía", "se trata de un dengue", "el diagnóstico es..." — afirmaciones, no posibilidades. */
const DIAGNOSTICO_AFIRMADO = new RegExp(
  `(?<!\\bsi )(?<!\\bsi usted )(?<!\\bsi ya )\\b(tienes|tiene|padeces|padece|sufres de|sufre de|es un caso de|se trata de|definitivamente es|seguramente es|el diagnostico es)\\s+(un |una |de |el |la )?(${DIAGNOSTICOS.join('|')})\\b`
);

function oraciones(texto: string): string[] {
  return texto.split(/(?<=[.!?\n])\s+/).map((o) => o.trim()).filter(Boolean);
}

export interface EntradaVerificador {
  respuesta: string;
  fase: Fase;
  /** Hubo alarma en esta consulta: toda respuesta debe recordar urgencias o el 123. */
  alarmaActivada: boolean;
  /** Frases aprobadas del protocolo activo: lo que dicen está permitido. */
  frasesAprobadas: FraseProtocolo[];
}

export function verificarRespuesta({ respuesta, fase, alarmaActivada, frasesAprobadas }: EntradaVerificador): Falla[] {
  const fallas: Falla[] = [];
  const texto = normalizar(respuesta);
  const aprobado = normalizar(frasesAprobadas.map((f) => f.texto).join('\n'));

  const dosis = texto.match(DOSIS);
  if (dosis && !aprobado.includes(dosis[0])) {
    fallas.push({ codigo: 'dosis', detalle: `menciona una dosis o cantidad de medicamento ("${dosis[0]}")` });
  }

  for (const oracion of oraciones(texto)) {
    const nombrado = MEDICAMENTOS.find((m) => new RegExp(`\\b${m}`).test(oracion));
    if (nombrado && !CONTEXTO_SEGURO.test(oracion) && !aprobado.includes(nombrado)) {
      fallas.push({ codigo: 'medicamento', detalle: `recomienda o sugiere un medicamento ("${nombrado}")` });
      break;
    }
  }

  // Las preguntas ("¿tienes asma?") y los condicionales ("si tienes diabetes...") no afirman nada.
  const afirmacion = oraciones(texto)
    .filter((o) => !o.includes('?') && !/^(y |pero )?si /.test(o))
    .map((o) => o.match(DIAGNOSTICO_AFIRMADO))
    .find(Boolean);
  if (afirmacion) {
    fallas.push({ codigo: 'diagnostico_afirmado', detalle: `afirma un diagnóstico ("${afirmacion[0]}")` });
  }

  if (/\b2654\b/.test(texto)) {
    fallas.push({ codigo: 'norma_derogada', detalle: 'cita la Resolución 2654 de 2019, que fue derogada' });
  }

  if (fase === 'entrevista' && !respuesta.includes('?')) {
    fallas.push({ codigo: 'sin_pregunta', detalle: 'en esta fase debe hacer al menos una pregunta' });
  }

  if (alarmaActivada && !/\b(123|urgencias)\b/.test(texto)) {
    fallas.push({ codigo: 'sin_aviso_urgencias', detalle: 'hubo un signo de alarma: debe recordar ir a urgencias o llamar al 123' });
  }

  return fallas;
}

/** Instrucción de corrección para el segundo intento. */
export function instruccionDeCorreccion(fallas: Falla[]): string {
  return `Tu respuesta anterior no se envió porque: ${fallas.map((f) => f.detalle).join('; ')}. Escríbela de nuevo corrigiendo eso y cumpliendo todas las reglas.`;
}
