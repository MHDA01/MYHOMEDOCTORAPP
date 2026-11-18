/**
 * Límite de peticiones por IP, en memoria.
 *
 * **Qué protege y qué no.** Esto frena el golpeo tonto: un bucle desde una
 * máquina, un script que descubre una ruta pública y la llama mil veces por
 * minuto. No frena a quien se lo tome en serio, por dos razones que conviene
 * tener escritas antes de confiar en esto más de lo que aguanta:
 *
 *  1. **La IP sale de una cabecera, y las cabeceras se pueden escribir.** De
 *     `x-forwarded-for` se lee la **penúltima** entrada, por lo que explica
 *     `ipDelPedido`. Aun leyéndola bien, quien rote de IP o de red se escapa.
 *  2. **La memoria es de cada instancia.** `apphosting.yaml` permite hasta
 *     cuatro, y cada una lleva su propia cuenta: el límite real es el
 *     configurado multiplicado por el número de instancias despiertas.
 *
 * La barrera de verdad para un ataque dirigido es Cloud Armor en el
 * balanceador, que cuesta y se configura fuera del código. Esto es lo que se
 * puede hacer gratis y hoy, y vale la pena porque el caso común es el del
 * bucle, no el del atacante.
 *
 * **Nada de esto se registra.** Una IP es un dato personal (Ley 1581) y no hay
 * ninguna razón para dejarla en los registros del servidor: las cuentas viven
 * en memoria, se vencen solas y nunca se escriben.
 */

export interface Veredicto {
  ok: boolean;
  /** Cuántas peticiones más se le permiten en esta ventana. */
  restantes: number;
  /** Cuánto falta para que la ventana se renueve. Alimenta `Retry-After`. */
  esperaMs: number;
}

export interface Limitador {
  permitir: (clave: string | null) => Veredicto;
  /** Borra las cuentas. Solo lo usan las pruebas. */
  reiniciar: () => void;
}

export interface OpcionesLimitador {
  /** Peticiones permitidas por ventana y por clave. */
  maximo: number;
  ventanaMs: number;
  /** El reloj del sistema. Se cambia solo en las pruebas. */
  ahora?: () => number;
  /**
   * Cuántas claves se guardan como máximo. Es un tope de seguridad: sin él, un
   * atacante que rote la cabecera llenaría la memoria de la instancia, y el
   * límite pensado para protegerla sería la forma de tumbarla. Al llegar al
   * tope se limpian las vencidas y, si no alcanza, se vacía la tabla: perder
   * las cuentas es menos grave que quedarse sin memoria.
   */
  maximoDeClaves?: number;
}

/** Todas las peticiones sin IP legible comparten esta cuenta, a propósito. */
const CLAVE_SIN_IP = 'sin-ip';

export function crearLimitador(opciones: OpcionesLimitador): Limitador {
  const ahora = opciones.ahora ?? (() => Date.now());
  const maximoDeClaves = opciones.maximoDeClaves ?? 10_000;
  /** clave → [cuántas van en la ventana, cuándo se vence] */
  const cuentas = new Map<string, { usadas: number; vence: number }>();

  function limpiar(instante: number): void {
    for (const [clave, cuenta] of cuentas) {
      if (cuenta.vence <= instante) cuentas.delete(clave);
    }
  }

  return {
    permitir(clave) {
      const instante = ahora();
      const llave = clave && clave.length > 0 ? clave : CLAVE_SIN_IP;

      if (cuentas.size >= maximoDeClaves) {
        limpiar(instante);
        if (cuentas.size >= maximoDeClaves) cuentas.clear();
      }

      const cuenta = cuentas.get(llave);
      if (!cuenta || cuenta.vence <= instante) {
        cuentas.set(llave, { usadas: 1, vence: instante + opciones.ventanaMs });
        return { ok: true, restantes: opciones.maximo - 1, esperaMs: opciones.ventanaMs };
      }

      const esperaMs = cuenta.vence - instante;
      if (cuenta.usadas >= opciones.maximo) {
        return { ok: false, restantes: 0, esperaMs };
      }

      cuenta.usadas += 1;
      return { ok: true, restantes: opciones.maximo - cuenta.usadas, esperaMs };
    },

    reiniciar() {
      cuentas.clear();
    },
  };
}

function entradasReenviadas(cabeceras: Headers): string[] {
  const reenviadas = cabeceras.get('x-forwarded-for');
  if (!reenviadas) return [];
  return reenviadas
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * Cuántas entradas trae `x-forwarded-for`. Solo sirve para el diagnóstico de
 * `/api/salud`: la forma de la cadena en producción decide si `ipDelPedido`
 * está acertando, y es un número, no una dirección, así que se puede registrar
 * sin guardar el dato personal de nadie.
 */
export function cuantasReenviadas(cabeceras: Headers): number {
  return entradasReenviadas(cabeceras).length;
}

/**
 * La IP del pedido, según las cabeceras que pone la infraestructura.
 *
 * Se devuelve la **penúltima** entrada de `x-forwarded-for`, y el motivo vale
 * la pena escribirlo porque las dos elecciones evidentes están mal:
 *
 *  - **La primera** la escribe el cliente. Quien mande una inventada distinta
 *    en cada petición se queda sin límite. Es el error habitual.
 *  - **La última** la pone el balanceador de Google, y es su propia dirección,
 *    la de la regla de reenvío. Con ella, *todo* el tráfico del planeta caería
 *    en la misma cuenta: el chequeo de disponibilidad se cortaría solo, y a
 *    cualquiera le bastaría gastar la cuota para dejar la app sin monitoreo.
 *    Es el error que tenía este archivo hasta que se verificó la cabecera.
 *
 * El balanceador añade dos entradas al final —la dirección que de verdad se
 * conectó a él y la suya—, así que la penúltima es la del cliente y es la única
 * que él no pudo escribir. Si mandó una cadena inventada, queda a la izquierda
 * y se ignora.
 *
 * Con una sola entrada se devuelve esa, que es el caso de desarrollo y de una
 * petición directa sin balanceador delante.
 */
export function ipDelPedido(cabeceras: Headers): string | null {
  const partes = entradasReenviadas(cabeceras);
  if (partes.length >= 2) return partes[partes.length - 2]!;
  if (partes.length === 1) return partes[0]!;

  const directa = cabeceras.get('x-real-ip')?.trim();
  return directa && directa.length > 0 ? directa : null;
}
