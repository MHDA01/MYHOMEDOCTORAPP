/**
 * El grafo, dentro del turno de la consulta.
 *
 * Es la costura entre dos mitades que ya existían y no se hablaban: el ejecutor
 * determinista (`grafo-ejecutor.ts`), que sabe recorrer, y el chat
 * (`actions/teleorientacion.ts`), que tiene la ficha, lo que la persona acaba de
 * decir y los hallazgos del episodio. Aquí no hay medicina: hay plomería y una
 * decisión de orden.
 *
 * **Puro y sin modelo, como el ejecutor.** No habla con Firestore —eso es de
 * `hallazgos-del-episodio.ts`— ni con Gemini. Correr el grafo no cuesta un peso
 * ni un milisegundo de espera del paciente, y por eso corre en **cada** turno y
 * no solo al final.
 *
 * ── LAS DOS COSAS QUE DECIDE ──
 *
 * 1. **Qué hallazgos ve el grafo.** Los del episodio hasta ahora, más los que el
 *    extractor acaba de aceptar, con lo nuevo primero. El orden no es estética:
 *    el ejecutor resuelve un hallazgo repetido quedándose con el primero, así
 *    que "lo último que dijo la persona" tiene que ir delante. La ficha la
 *    vuelca el propio ejecutor; aquí no se mezcla.
 * 2. **Si corrió de verdad.** "Corrió y no encontró nada" y "no tenía con qué
 *    encontrar nada" se ven igual en un log y no son lo mismo. Hoy, con la base
 *    de reglas vacía, siempre es lo segundo, y el log lo dice con esas palabras
 *    para que nadie lea el silencio como tranquilidad.
 *
 * ── LO QUE ESTO NO HACE, Y NO ES UN OLVIDO ──
 *
 * - **No cambia lo que Hilda dice.** Las preguntas del grafo no entran todavía
 *   al prompt: el orden de las preguntas es conducta clínica y la aprueba
 *   Alexander, árbol por árbol. Lo que sale de aquí hoy observa y escala, no
 *   conversa.
 * - **No apaga el detector de frases** de `senal-de-alarma.ts`. La alarma del
 *   grafo es una puerta MÁS para el botón de urgencias, nunca la única. Con la
 *   base vacía, reemplazar el detector sería cambiar una puerta que funciona por
 *   una que no puede abrirse.
 * - **No baja nada.** El piso solo sube, como en `nivelFinal()`.
 */

import { type HallazgoRegistrado } from '@/lib/hallazgos';
import { type Ficha } from '@/lib/ficha';
import { type BaseDeReglas } from '@/lib/grafo-reglas';
import { type ResultadoTurno, evaluarTurno } from '@/lib/grafo-ejecutor';
import { type NivelAtencion } from '@/lib/resumen-consulta';
import { BASE_DE_REGLAS, tieneReglas } from '@/lib/base-de-reglas';

/**
 * Tope de hallazgos que se arrastran de un episodio.
 *
 * Un documento de Firestore tiene 1 MB y cada hallazgo viaja con la frase
 * literal de la que salió. El tope existe para que una consulta larga no choque
 * contra ese límite y pierda la escritura entera; se quedan los más nuevos, que
 * son los que deciden. No es un criterio clínico: es el tamaño de un documento.
 */
export const TOPE_HALLAZGOS_EPISODIO = 400;

export type PorQueNoCorrio =
  /** Sin ficha no hay raíz: el grafo arranca con una lectura, no con un cuestionario. */
  | 'sin_ficha'
  /** La base de reglas no tiene nada aprobado. Ver `base-de-reglas.ts`. */
  | 'base_sin_reglas';

export interface GrafoDelTurno {
  /** Los hallazgos del episodio ya acumulados, listos para guardar. */
  hallazgos: HallazgoRegistrado[];
  /** `null` cuando no se pudo correr; entonces `porQueNoCorrio` dice por qué. */
  resultado: ResultadoTurno | null;
  porQueNoCorrio?: PorQueNoCorrio;
  /** Se disparó al menos una alarma determinista en este turno. */
  alarma: boolean;
  /** El nivel mínimo que el grafo ya tiene fijado, o `null` si no corrió. */
  piso: NivelAtencion | null;
}

export interface EntradaDelTurno {
  ficha: Ficha | null;
  /** Los hallazgos que ya traía el episodio. */
  previos: readonly HallazgoRegistrado[];
  /** Los que el extractor aceptó en este turno. */
  nuevos: readonly HallazgoRegistrado[];
  /** AAAA-MM-DD. */
  hoy: string;
  base?: BaseDeReglas;
}

/**
 * Acumula los hallazgos del episodio: lo nuevo adelante, y una sola entrada por
 * hallazgo y temporalidad.
 *
 * Dedupa por `id` + `temporalidad` a propósito, no solo por `id`: "me dolía el
 * pecho hace cinco años" y "me duele el pecho ahora" son el mismo vocabulario y
 * conducta opuesta (regla 5 de `hallazgos.ts`). Pisar uno con el otro sería el
 * peor error posible en este archivo.
 *
 * Y lo nuevo gana sin preguntar, que es distinto de lo que hace la ficha —donde
 * una contradicción se pregunta y no se sobrescribe—. La razón es que esto es un
 * episodio y no una historia: dentro de la misma consulta, la última cosa que
 * dijo la persona sobre su dolor de ahora es la que vale.
 */
export function acumular(
  previos: readonly HallazgoRegistrado[],
  nuevos: readonly HallazgoRegistrado[]
): HallazgoRegistrado[] {
  const clave = (h: HallazgoRegistrado) => `${h.id}|${h.temporalidad}`;
  const vistos = new Set<string>();
  const salida: HallazgoRegistrado[] = [];

  for (const h of [...nuevos, ...previos]) {
    const k = clave(h);
    if (vistos.has(k)) continue;
    vistos.add(k);
    salida.push(h);
  }

  return salida.slice(0, TOPE_HALLAZGOS_EPISODIO);
}

/**
 * Corre el grafo sobre el turno. Nunca lanza: devuelve siempre los hallazgos
 * acumulados, con o sin resultado.
 *
 * Que no lance importa más de lo que parece. Esto corre dentro de un turno de
 * consulta que ya tiene su respuesta lista, y una excepción aquí dejaría sin
 * orientación a quien está preguntando por un fallo de una pieza que todavía no
 * decide nada.
 */
export function correrElGrafo(entrada: EntradaDelTurno): GrafoDelTurno {
  const hallazgos = acumular(entrada.previos, entrada.nuevos);
  const base = entrada.base ?? BASE_DE_REGLAS;

  const sinCorrer = (porQue: PorQueNoCorrio): GrafoDelTurno => ({
    hallazgos,
    resultado: null,
    porQueNoCorrio: porQue,
    alarma: false,
    piso: null,
  });

  if (!entrada.ficha) return sinCorrer('sin_ficha');
  if (!tieneReglas(base)) return sinCorrer('base_sin_reglas');

  const resultado = evaluarTurno(
    { ficha: entrada.ficha, hallazgos, hoy: entrada.hoy },
    base
  );

  return {
    hallazgos,
    resultado,
    alarma: resultado.alarmas.length > 0,
    piso: resultado.piso,
  };
}

/**
 * Una línea para el log del turno.
 *
 * Los logs de Cloud Functions y de Next no traen severity y se buscan por
 * texto, así que el prefijo es fijo y las alarmas se nombran por su id: lo que
 * se va a buscar el día que haya que revisar una consulta es "alarma".
 */
export function resumenParaLog(g: GrafoDelTurno): string {
  if (!g.resultado) {
    const porQue =
      g.porQueNoCorrio === 'sin_ficha'
        ? 'no corrió: la consulta no tiene ficha'
        : 'no corrió: la base de reglas no tiene nada aprobado';
    return `[Dra. Hilda] Grafo: ${porQue} (${g.hallazgos.length} hallazgo(s) en el episodio)`;
  }

  const r = g.resultado;
  const partes = [
    `${g.hallazgos.length} hallazgo(s)`,
    `piso ${r.piso}`,
    r.alarmas.length
      ? `ALARMA: ${r.alarmas.map((a) => a.alarma.id).join(', ')}`
      : 'sin alarmas',
  ];
  if (r.sindromes.length) partes.push(`síndromes: ${r.sindromes.map((s) => s.id).join(', ')}`);
  if (r.sospechas.length) {
    partes.push(`sospechas: ${r.sospechas.map((s) => `${s.activador.id}(${s.prioridad})`).join(', ')}`);
  }
  partes.push(
    r.siguiente.tipo === 'preguntar'
      ? `siguiente: preguntar "${r.siguiente.pregunta.hallazgo}" (${r.siguiente.pregunta.prioridad})`
      : `siguiente: concluir por ${r.siguiente.razon}`
  );

  return `[Dra. Hilda] Grafo: ${partes.join('; ')}`;
}
