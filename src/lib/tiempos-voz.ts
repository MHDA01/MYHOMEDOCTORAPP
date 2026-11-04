/**
 * Cronómetro del turno hablado de Hilda.
 *
 * Por qué existe: en el modo conversación se sabía que Hilda tardaba, pero no
 * dónde. El reparto de la espera cambia por completo qué hay que arreglar —si
 * los segundos están en el razonamiento del modelo, acelerar la síntesis de voz
 * no se nota— y adivinarlo sale caro. Esto pone el número en cada tramo.
 *
 * Nada de esto toca el navegador ni el servidor: son funciones puras para poder
 * probarlas. Quien mide es `ModoVoz` (el turno completo), `useVozHilda` (la voz)
 * y las acciones de servidor (la cadena de Firestore y la IA), cada uno con su
 * propio reloj.
 *
 * Lo que se registra son **duraciones y tamaños, nunca el texto**: lo que el
 * paciente dice y lo que Hilda contesta es información clínica y no tiene por
 * qué quedar en los registros del servidor ni en la consola del teléfono.
 */

/**
 * Los momentos del turno, en el orden en que ocurren.
 *
 *  - `ultima-palabra`: lo último que el micrófono entendió. Es el cero del
 *    turno: desde aquí el paciente ya se calló y está esperando. Es una
 *    aproximación —el reconocimiento entrega las palabras con su propio
 *    retraso— pero es lo más cerca del silencio real que se puede medir desde
 *    el teléfono.
 *  - `envio`: se cumplió la espera de silencio y el mensaje sale.
 *  - `respuesta`: llegó el texto de Hilda, entero.
 *  - `audio-pedido` / `audio-listo`: el primer trozo de voz, pedido y recibido.
 *  - `primera-palabra`: Hilda empieza a sonar. Aquí termina la espera que el
 *    paciente percibe.
 */
export type EtapaVoz =
  | 'ultima-palabra'
  | 'envio'
  | 'respuesta'
  | 'audio-pedido'
  | 'audio-listo'
  | 'primera-palabra';

export interface Tramo {
  nombre: string;
  ms: number;
}

export interface RelojVoz {
  /** Apunta la hora de una etapa. La primera marca manda; repetirla no la mueve. */
  marcar: (etapa: EtapaVoz) => void;
  /** Los tramos que se pudieron medir, en orden. Los incompletos se omiten. */
  tramos: () => Tramo[];
  /** Una línea para la consola o la pantalla. Vacía si no hay nada medido. */
  resumen: () => string;
}

/**
 * Los tramos que interesan.
 *
 * `síntesis` está dentro de `voz`, y `voz` + `servidor` + `silencio` suman
 * `total`: están a propósito todos juntos y planos, porque lo que se busca al
 * leer la línea es cuál de los números es el grande.
 */
const TRAMOS: ReadonlyArray<{ nombre: string; de: EtapaVoz; a: EtapaVoz }> = [
  { nombre: 'silencio', de: 'ultima-palabra', a: 'envio' },
  { nombre: 'servidor', de: 'envio', a: 'respuesta' },
  { nombre: 'síntesis', de: 'audio-pedido', a: 'audio-listo' },
  { nombre: 'voz', de: 'respuesta', a: 'primera-palabra' },
  { nombre: 'total', de: 'ultima-palabra', a: 'primera-palabra' },
];

/** Milisegundos legibles de un golpe de vista: "420 ms", "6.2 s". */
export function formatearDuracion(ms: number): string {
  const limpio = Math.max(0, Math.round(ms));
  if (limpio < 1000) return `${limpio} ms`;
  return `${(limpio / 1000).toFixed(1)} s`;
}

/** Una lista de tramos en una línea: "silencio 2.5 s · servidor 6.1 s". */
export function formatearTramos(tramos: ReadonlyArray<Tramo>): string {
  return tramos.map((t) => `${t.nombre} ${formatearDuracion(t.ms)}`).join(' · ');
}

export interface OpcionesRelojVoz {
  /** El cero del turno, si ya ocurrió antes de crear el reloj. */
  origen?: number;
  /** El reloj del sistema. Se cambia solo en las pruebas. */
  ahora?: () => number;
  /**
   * Se avisa en cada etapa nueva. `ModoVoz` lo usa para mostrar el reparto en
   * cuanto Hilda abre la boca, sin esperar a que termine de hablar.
   */
  alMarcar?: (etapa: EtapaVoz, reloj: RelojVoz) => void;
}

export function crearRelojVoz(opciones: OpcionesRelojVoz = {}): RelojVoz {
  const ahora = opciones.ahora ?? (() => Date.now());
  const marcas = new Map<EtapaVoz, number>();
  if (opciones.origen != null) marcas.set('ultima-palabra', opciones.origen);

  const reloj: RelojVoz = {
    marcar(etapa) {
      // La primera marca manda: `audio-pedido` ocurre una vez por trozo y lo
      // que importa es el primero, el que el paciente está esperando.
      if (marcas.has(etapa)) return;
      marcas.set(etapa, ahora());
      opciones.alMarcar?.(etapa, reloj);
    },

    tramos() {
      const salida: Tramo[] = [];
      for (const { nombre, de, a } of TRAMOS) {
        const inicio = marcas.get(de);
        const fin = marcas.get(a);
        if (inicio === undefined || fin === undefined) continue;
        salida.push({ nombre, ms: Math.max(0, fin - inicio) });
      }
      return salida;
    },

    resumen() {
      return formatearTramos(reloj.tramos());
    },
  };

  return reloj;
}

// ─────────────────────────────────────────────────────────────
// Verlo en el teléfono
// ─────────────────────────────────────────────────────────────

/**
 * La única función de este archivo que no es pura.
 *
 * Por qué hace falta: la medición que importa es en un teléfono de verdad, con
 * datos móviles, y ahí no hay consola a la vista. Con `?tiempos=1` una vez, el
 * modo conversación muestra el reparto en pantalla hasta que se apague con
 * `?tiempos=0`. Apagado por defecto: es una herramienta de medición, no algo
 * que un paciente deba ver.
 */
const CLAVE_TIEMPOS = 'mhda:tiempos-voz';

export function tiemposALaVista(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const pedido = new URLSearchParams(window.location.search).get('tiempos');
    if (pedido === '1' || pedido === 'si') {
      localStorage.setItem(CLAVE_TIEMPOS, 'si');
      return true;
    }
    if (pedido === '0' || pedido === 'no') {
      localStorage.removeItem(CLAVE_TIEMPOS);
      return false;
    }
    return localStorage.getItem(CLAVE_TIEMPOS) === 'si';
  } catch {
    // Sin almacenamiento ni dirección legible, simplemente no se muestra.
    return false;
  }
}
