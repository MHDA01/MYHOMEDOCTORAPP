/**
 * Una regla del grafo, en palabras que el médico pueda leer. Código puro.
 *
 * El diseño dice que **el activador es la unidad de aprobación** y que se revisa
 * en medio minuto. Eso solo es cierto si la regla se puede leer sin leer código:
 * `{ op: 'alMenos', n: 2, de: [...] }` no se revisa en medio minuto, y una regla
 * que nadie lee de verdad se aprueba por cansancio.
 *
 * ── DOS ADVERTENCIAS ──
 *
 * 1. **Esto no es texto para el paciente.** Se ve solo en Administración →
 *    Protocolos, y por eso aquí sí se nombran sospechas y síndromes. El texto
 *    que ve la persona vive en el desenlace del árbol, lo aprueba Alexander y
 *    `revisarBase()` le prohíbe la palabra "síndrome".
 * 2. **Describe, no interpreta.** Dice lo que la regla hará, no si está bien. Si
 *    un umbral está mal, esto lo escribe con todas sus letras; quien juzga es el
 *    médico responsable.
 */

import {
  type Activador,
  type Alarma,
  type Arbol,
  type BaseDeReglas,
  type Condicion,
  type Escala,
  type Sindrome,
  type Susceptibilidad,
  esCompuesta,
} from '@/lib/grafo-reglas';
import { definicion } from '@/lib/hallazgos';

/**
 * El nombre clínico del hallazgo, o su id entre signos si no está en el
 * vocabulario.
 *
 * Un id que no existe no se esconde: `revisarBase()` ya lo rechaza, y en la
 * pantalla tiene que verse cuál es para poder arreglarlo.
 */
function nombreDeHallazgo(id: string): string {
  const def = definicion(id);
  if (!def) return `¿${id}?`;
  return def.pendienteAprobacion ? `${def.nombreClinico} (sin aprobar)` : def.nombreClinico;
}

function valorEnPalabras(valor: number | string): string {
  return typeof valor === 'number' ? String(valor) : `"${valor}"`;
}

function cuando(temporalidad: 'actual' | 'antecedente' | undefined): string {
  if (temporalidad === 'antecedente') return ' como antecedente';
  if (temporalidad === 'actual') return ' hoy';
  return '';
}

/**
 * Una condición, en una frase.
 *
 * Las compuestas se envuelven en paréntesis cuando van dentro de otra, que es la
 * única forma de que "A y (B o C)" no se lea igual que "(A y B) o C".
 */
export function condicionEnPalabras(cond: Condicion, dentro = false): string {
  if (esCompuesta(cond)) {
    const partes = cond.de.map((c) => condicionEnPalabras(c, true));
    if (cond.op === 'alMenos') {
      return `al menos ${cond.n} de: ${partes.join('; ')}`;
    }
    const frase = partes.join(cond.op === 'todas' ? ' y ' : ' o ');
    return dentro ? `(${frase})` : frase;
  }

  const nombre = nombreDeHallazgo(cond.hallazgo);
  const momento = cuando(cond.temporalidad);

  switch (cond.op) {
    case 'presente':
      return `${nombre} presente${momento}`;
    case 'negado':
      return `${nombre} negado${momento}`;
    case 'conocido':
      return `${nombre} preguntado y contestado${momento}`;
    case '==':
      return `${nombre}${momento} es ${valorEnPalabras(cond.valor)}`;
    case 'en':
      return `${nombre}${momento} es alguno de ${cond.valores.map(valorEnPalabras).join(', ')}`;
    default:
      return `${nombre}${momento} ${cond.op} ${cond.valor}`;
  }
}

/** Las líneas de una regla, en el orden en que conviene leerlas. */
export interface ReglaEnPalabras {
  /** Lo que la regla es, para el título. */
  titulo: string;
  /** El id técnico, que es lo que sale en el log del turno. */
  id: string;
  /** Qué hace, frase por frase. */
  lineas: string[];
  /** De dónde salió y quién la firmó. */
  fuente: string;
  firma: string;
}

function trazaEnPalabras(r: { fuente: { documento: string; pagina?: string; anio?: number }; aprobadoPor: { medico: string; fecha: string } }) {
  const partes = [r.fuente.documento];
  if (r.fuente.pagina) partes.push(`p. ${r.fuente.pagina}`);
  if (r.fuente.anio) partes.push(String(r.fuente.anio));
  return {
    fuente: partes.join(', '),
    firma: `${r.aprobadoPor.medico} · ${r.aprobadoPor.fecha}`,
  };
}

export function alarmaEnPalabras(a: Alarma): ReglaEnPalabras {
  return {
    titulo: a.nombreClinico,
    id: a.id,
    lineas: [
      `Se dispara cuando: ${condicionEnPalabras(a.cuando)}.`,
      `Escala a ${a.escalaA.replace(/_/g, ' ')}, severidad ${a.severidad}.`,
      'Corre en cada turno y no exige antecedentes.',
    ],
    ...trazaEnPalabras(a),
  };
}

export function activadorEnPalabras(a: Activador): ReglaEnPalabras {
  const lineas = [`Se sospecha cuando: ${condicionEnPalabras(a.disparadores)}.`];
  if (a.requisitos) lineas.push(`Solo si además: ${condicionEnPalabras(a.requisitos)}.`);
  lineas.push(`Prioridad ${a.prioridad}${a.amenazaVidaAguda ? ', declarada como amenaza aguda para la vida' : ''}.`);
  if (a.nivelMinimo) lineas.push(`Fija un piso de ${a.nivelMinimo.replace(/_/g, ' ')}.`);
  if (a.preguntas?.length) {
    lineas.push(`Pregunta además por: ${a.preguntas.map(nombreDeHallazgo).join(', ')}.`);
  }
  if (a.explicacionesComunes?.length) {
    lineas.push(
      `Antes de nombrar lo raro pregunta por lo común: ${a.explicacionesComunes
        .map((x) => `${x.nombreClinico} (${x.frecuencia})`)
        .join(', ')}.`
    );
  }
  if (a.escalas?.length) lineas.push(`Querría calcular: ${a.escalas.join(', ')}.`);
  if (a.disparadoresRelajados) {
    lineas.push(`Con una susceptibilidad que predice presentación atípica basta: ${condicionEnPalabras(a.disparadoresRelajados)}.`);
  }
  return { titulo: a.sospecha, id: a.id, lineas, ...trazaEnPalabras(a) };
}

export function sindromeEnPalabras(s: Sindrome): ReglaEnPalabras {
  return {
    titulo: s.nombreClinico,
    id: s.id,
    lineas: [
      `Sistema: ${s.sistema}.`,
      `Se cumple cuando: ${condicionEnPalabras(s.criterios)}.`,
      `Fija un piso de ${s.piso.replace(/_/g, ' ')}, aunque la sospecha concreta esté equivocada.`,
      `Al paciente se le dice: "${s.explicacionLlana}"`,
    ],
    ...trazaEnPalabras(s),
  };
}

export function susceptibilidadEnPalabras(s: Susceptibilidad): ReglaEnPalabras {
  const lineas = [
    `Aplica cuando: ${condicionEnPalabras(s.cuando)}.`,
    `Sube la prioridad de: ${s.eleva.join(', ')}.`,
  ];
  if (s.relaja?.length) lineas.push(`Relaja los disparadores de: ${s.relaja.join(', ')}.`);
  return { titulo: s.nombreClinico, id: s.id, lineas, ...trazaEnPalabras(s) };
}

export function escalaEnPalabras(e: Escala): ReglaEnPalabras {
  return {
    titulo: e.nombreClinico,
    id: e.id,
    lineas: [
      `Necesita: ${e.variables.map(nombreDeHallazgo).join(', ')}.`,
      'Si falta una variable, el puntaje no se calcula: se dice qué falta.',
    ],
    ...trazaEnPalabras(e),
  };
}

export function arbolEnPalabras(a: Arbol): ReglaEnPalabras {
  const desenlaces = a.nodos.filter((n) => n.desenlace).length;
  const preguntas = a.nodos.filter((n) => n.llena).length;
  const instrumento = a.nodos.filter((n) => n.exigeInstrumento).length;
  const lineas = [
    `Motivo: "${a.motivo}". Empieza en el nodo "${a.raiz}".`,
    `${a.nodos.length} nodos: ${preguntas} que preguntan y ${desenlaces} que concluyen.`,
  ];
  if (instrumento) lineas.push(`${instrumento} se paran por falta de un instrumento o un examen.`);
  if (a.adelanta?.length) {
    lineas.push(`Adelanta sobre el orden canónico: ${a.adelanta.map(nombreDeHallazgo).join(', ')}.`);
  }
  lineas.push('Un árbol decide qué preguntar después, nunca qué es verdad.');
  // Un árbol no es `Trazable`: la firma va en cada desenlace, porque lo que se
  // aprueba es el texto que la persona se lleva, no la forma del árbol.
  const firmas = [...new Set(a.nodos.flatMap((n) => (n.desenlace ? [`${n.desenlace.aprobadoPor.medico} · ${n.desenlace.aprobadoPor.fecha}`] : [])))];
  return {
    titulo: a.motivo,
    id: a.id,
    lineas,
    fuente: 'La firma de un árbol va en cada desenlace',
    firma: firmas.join(' / ') || 'sin desenlaces firmados',
  };
}

/** Las clases de regla, con su nombre en la pantalla y cómo se lee cada una. */
export const CLASES_EN_PALABRAS = [
  { clase: 'alarmas', singular: 'Alarma', plural: 'Alarmas', leer: alarmaEnPalabras },
  { clase: 'activadores', singular: 'Activador', plural: 'Activadores', leer: activadorEnPalabras },
  { clase: 'sindromes', singular: 'Síndrome', plural: 'Síndromes', leer: sindromeEnPalabras },
  { clase: 'susceptibilidades', singular: 'Susceptibilidad', plural: 'Susceptibilidades', leer: susceptibilidadEnPalabras },
  { clase: 'escalas', singular: 'Escala', plural: 'Escalas', leer: escalaEnPalabras },
  { clase: 'arboles', singular: 'Árbol', plural: 'Árboles', leer: arbolEnPalabras },
] as const;

export type ClaseDeRegla = (typeof CLASES_EN_PALABRAS)[number]['clase'];

/** Toda la base, clase por clase, lista para pintar. */
export function baseEnPalabras(
  base: BaseDeReglas
): { clase: ClaseDeRegla; singular: string; plural: string; reglas: ReglaEnPalabras[] }[] {
  return CLASES_EN_PALABRAS.map(({ clase, singular, plural, leer }) => ({
    clase,
    singular,
    plural,
    // El `as never` es el precio de recorrer seis clases distintas con un solo
    // bucle: cada `leer` solo acepta la suya, y el emparejamiento lo garantiza
    // la tabla de arriba, donde clase y lector van en la misma fila.
    reglas: (base[clase] as readonly never[]).map((r) => (leer as (x: never) => ReglaEnPalabras)(r)),
  }));
}
