/**
 * Qué cambia entre la base publicada y la que se va a publicar. Código puro.
 *
 * Publicar es un acto sobre la base **completa** (el por qué está en
 * `constants.ts`), y eso tiene un filo: quien publica para añadir un activador
 * puede, sin darse cuenta, retirar una alarma que ya estaba funcionando, porque
 * el documento que pegó no la traía. Un recuento de "12 reglas" no avisa de eso;
 * "sale 1 alarma" sí.
 *
 * Así que esto existe para una sola frase de la pantalla: **lo que entra, lo que
 * sale y lo que cambia**, antes de escribir nada. Es la última baranda de las
 * cuatro, y la única que no puede estar en el servidor: es una pregunta al
 * médico, no una validación.
 */

import { type BaseDeReglas } from '@/lib/grafo-reglas';
import { CLASES_EN_PALABRAS, type ClaseDeRegla } from '@/lib/reglas-en-palabras';

export interface ReglaCambiada {
  clase: ClaseDeRegla;
  /** Cómo se llama la clase en la pantalla: "Alarma", "Activador"... */
  comoSeLlama: string;
  id: string;
  /** El nombre clínico, o el motivo si es un árbol. */
  titulo: string;
}

export interface CambiosDeBase {
  entran: ReglaCambiada[];
  salen: ReglaCambiada[];
  cambian: ReglaCambiada[];
  /** Las que siguen exactamente igual. Solo el número: no hay nada que leer. */
  iguales: number;
  /** Si no cambia absolutamente nada. */
  sinCambios: boolean;
}

/**
 * El mismo objeto, siempre con las claves en el mismo orden.
 *
 * Dos reglas idénticas pueden llegar con las claves en distinto orden —Firestore
 * devuelve los campos de un mapa ordenados por nombre, y el analizador los
 * construye en el orden en que están escritos—, así que comparar el JSON tal
 * cual marcaría como "cambiada" una regla que nadie tocó. Las **listas** no se
 * ordenan: en una condición el orden es la cola de preguntas, y en un árbol es
 * el orden de las ramas. Ahí un cambio de orden sí es un cambio.
 */
function canonico(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonico);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, x]) => [k, canonico(x)])
    );
  }
  return v;
}

function huella(regla: unknown): string {
  return JSON.stringify(canonico(regla));
}

/** El nombre que se lee de cada clase de regla: el árbol usa su motivo. */
function tituloDe(clase: ClaseDeRegla, regla: Record<string, unknown>): string {
  const candidatos = clase === 'activadores' ? ['sospecha'] : clase === 'arboles' ? ['motivo'] : ['nombreClinico'];
  for (const campo of candidatos) {
    const v = regla[campo];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return String(regla.id ?? '');
}

export function compararBases(anterior: BaseDeReglas, nueva: BaseDeReglas): CambiosDeBase {
  const entran: ReglaCambiada[] = [];
  const salen: ReglaCambiada[] = [];
  const cambian: ReglaCambiada[] = [];
  let iguales = 0;

  for (const { clase, singular } of CLASES_EN_PALABRAS) {
    const antes = new Map(
      (anterior[clase] as readonly { id: string }[]).map((r) => [r.id, r as Record<string, unknown>])
    );
    const ahora = new Map(
      (nueva[clase] as readonly { id: string }[]).map((r) => [r.id, r as Record<string, unknown>])
    );

    for (const [id, regla] of ahora) {
      const vieja = antes.get(id);
      const cual: ReglaCambiada = { clase, comoSeLlama: singular, id, titulo: tituloDe(clase, regla) };
      if (!vieja) entran.push(cual);
      else if (huella(vieja) !== huella(regla)) cambian.push(cual);
      else iguales++;
    }

    for (const [id, regla] of antes) {
      if (!ahora.has(id)) {
        salen.push({ clase, comoSeLlama: singular, id, titulo: tituloDe(clase, regla) });
      }
    }
  }

  return {
    entran,
    salen,
    cambian,
    iguales,
    sinCambios: entran.length === 0 && salen.length === 0 && cambian.length === 0,
  };
}

/**
 * Lo que hay que mirar dos veces antes de confirmar.
 *
 * Una regla que **sale** o que **cambia** altera lo que la app ya está haciendo
 * hoy; una que entra solo añade. Y una alarma que sale es la peor de todas, por
 * lo que una alarma es: la salida de un árbol que se volvió jaula. La pantalla
 * usa esto para decidir qué pinta en rojo, no para impedir nada.
 */
export function pesoDelCambio(cambios: CambiosDeBase): 'ninguno' | 'solo_suma' | 'altera' | 'quita_alarma' {
  if (cambios.sinCambios) return 'ninguno';
  if (cambios.salen.some((r) => r.clase === 'alarmas')) return 'quita_alarma';
  if (cambios.salen.length || cambios.cambian.length) return 'altera';
  return 'solo_suma';
}
