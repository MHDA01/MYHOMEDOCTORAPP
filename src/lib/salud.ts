/**
 * El latido de la app: qué se revisa para decir "está arriba" y qué se contesta.
 *
 * Por qué existe: hasta ahora, que la app estuviera caída se sabía porque
 * alguien escribía. No había ningún punto que una máquina pudiera preguntar
 * cada cinco minutos. Esto es ese punto, y está pensado para que lo consulte un
 * chequeo de disponibilidad de Cloud Monitoring, que solo entiende dos cosas:
 * el código de la respuesta y cuánto tardó.
 *
 * Tres decisiones que no son de estilo:
 *
 *  1. **La respuesta es pública y no cuenta nada.** El endpoint no puede
 *     autenticarse —un chequeo de disponibilidad no sabe iniciar sesión—, así
 *     que lo que contesta lo puede leer cualquiera. Por eso sale el nombre del
 *     chequeo y si pasó o no, y nunca el mensaje de la excepción, el nombre del
 *     proyecto, una versión, una ruta ni un fragmento de clave: el detalle de
 *     por qué falló va al registro del servidor, donde solo llega Alexander.
 *
 *  2. **Lo que se rompe no es la app, son sus dependencias.** Que el proceso
 *     conteste ya lo demuestra el hecho de recibir respuesta; lo que hay que
 *     averiguar es si Firestore responde y si las claves están puestas. De las
 *     claves se mira la **presencia, nunca el valor**, y a Gemini no se le
 *     llama: cuesta dinero por consulta y cada latido lo pagaría.
 *
 *  3. **Un fallo tiene que cambiar el código de la respuesta.** Si todo
 *     contestara 200 con un `ok: false` adentro, el chequeo de disponibilidad
 *     lo daría por bueno y la alerta nunca sonaría. De ahí `codigoHttp`.
 */

import { crearLimitador } from './limite-peticiones';

/**
 * Cuánto se le concede a una dependencia antes de darla por caída.
 *
 * El número sale de medir, no de redondear: con la credencial de producción, la
 * primera lectura de Firestore de un proceso recién levantado tardó 3,2 s, y
 * 190 ms una vez caliente. Como `apphosting.yaml` tiene `minInstances: 0`, la
 * app se apaga sola y buena parte de los latidos pagan ese arranque en frío.
 * Un límite de 5 s habría convertido cada arranque lento en una alarma falsa, y
 * una alarma que miente se acaba ignorando.
 */
export const LIMITE_POR_CHEQUEO_MS = 8_000;

/**
 * El prefijo con el que se busca esto en los registros.
 *
 * Los registros de App Hosting y de Cloud Functions llegan sin severity, así
 * que filtrar por ERROR no sirve y el texto es el único asidero. Un prefijo
 * raro y de una sola pieza es lo que hace posible contar los fallos después.
 */
export const MARCA_REGISTRO = 'MHDA_SALUD';

/**
 * Cuántos latidos se le permiten a una misma IP por minuto.
 *
 * Un chequeo de disponibilidad pide uno cada varios minutos desde cada región,
 * así que con 60 va sobradísimo, y a un bucle que llame mil veces por minuto lo
 * corta en seco igual. Lo que este número protege no es el servidor —la ruta es
 * barata— sino la lectura de Firestore que hay detrás, que sí se cobra.
 *
 * **Por qué 60 y no 20.** Es un seguro hasta confirmar en producción la forma
 * de `x-forwarded-for`. Si la cadena trajera una entrada más de lo previsto, la
 * clave dejaría de ser la IP del cliente y todo el tráfico caería en una sola
 * cuenta; con un límite apretado eso apagaría el monitoreo sin avisar. Con 60
 * aguanta incluso en ese caso, y el registro de `/api/salud` deja constancia de
 * cuántas entradas llegaron para poder bajarlo con certeza.
 *
 * Las otras salvedades están en `limite-peticiones.ts`: la cuenta es de cada
 * instancia, y la IP sale de una cabecera.
 */
export const LATIDOS_POR_MINUTO = 60;

/**
 * El contador compartido de la ruta. Vive aquí, y no dentro de la ruta, para
 * que las pruebas puedan reiniciarlo entre casos.
 */
export const limitadorDeSalud = crearLimitador({
  maximo: LATIDOS_POR_MINUTO,
  ventanaMs: 60_000,
});

export type EstadoSalud = 'ok' | 'degradado' | 'caido';

export interface Chequeo {
  /** Un nombre corto y sin datos dentro: sale en una respuesta pública. */
  nombre: string;
  ok: boolean;
  ms?: number;
  /**
   * Un chequeo esencial caído deja la app en `caido`; uno no esencial, en
   * `degradado`. La diferencia es si un paciente puede usar la app ahora.
   */
  esencial: boolean;
}

export interface Latido {
  estado: EstadoSalud;
  /** Milisegundos del latido completo. El chequeo de disponibilidad lo grafica. */
  ms: number;
  chequeos: Chequeo[];
}

/**
 * De la lista de chequeos al estado de la app.
 *
 * `degradado` existe para no despertar a nadie de madrugada por algo que el
 * paciente no nota, y para no esconderlo tampoco.
 */
export function resumirEstado(chequeos: ReadonlyArray<Chequeo>): EstadoSalud {
  if (chequeos.some((c) => c.esencial && !c.ok)) return 'caido';
  if (chequeos.some((c) => !c.ok)) return 'degradado';
  return 'ok';
}

/**
 * El código de la respuesta.
 *
 * `degradado` contesta 200 a propósito: la app sirve, y un 503 ahí llenaría de
 * ruido la única alerta que importa. Que algo esté degradado se ve en el cuerpo
 * y en los registros, no en una llamada de madrugada.
 */
export function codigoHttp(estado: EstadoSalud): number {
  return estado === 'caido' ? 503 : 200;
}

/**
 * Qué claves tienen que estar puestas para que la app funcione.
 *
 * Se comprueba que la variable exista y no esté vacía. Nada más: el valor no se
 * lee, no se registra y no sale en la respuesta.
 */
export const CLAVES_ESENCIALES = [
  ['MHD_FIREBASE_PROJECT_ID', 'FIREBASE_PROJECT_ID'],
  ['MHD_FIREBASE_CLIENT_EMAIL', 'FIREBASE_CLIENT_EMAIL'],
  ['MHD_FIREBASE_PRIVATE_KEY', 'FIREBASE_PRIVATE_KEY'],
  ['MHDA_ENCRYPTION_KEY'],
] as const;

/**
 * Claves que, si faltan, dejan la app en pie pero a media máquina: sin ellas
 * Hilda no contesta, y aun así el paciente puede entrar, ver su ficha y
 * descargar sus informes.
 */
export const CLAVES_NO_ESENCIALES = [['GEMINI_API_KEY']] as const;

type Entorno = Record<string, string | undefined>;

function algunaPuesta(nombres: ReadonlyArray<string>, entorno: Entorno): boolean {
  return nombres.some((nombre) => {
    const valor = entorno[nombre];
    return typeof valor === 'string' && valor.trim().length > 0;
  });
}

/**
 * El chequeo de configuración. Dos chequeos, no uno por clave: el nombre de una
 * clave que falta no es un secreto, pero tampoco hace falta publicarlo.
 */
export function chequearClaves(entorno: Entorno): Chequeo[] {
  const faltanEsenciales = CLAVES_ESENCIALES.some((grupo) => !algunaPuesta(grupo, entorno));
  const faltanOpcionales = CLAVES_NO_ESENCIALES.some((grupo) => !algunaPuesta(grupo, entorno));

  return [
    { nombre: 'claves', ok: !faltanEsenciales, esencial: true },
    { nombre: 'claves-ia', ok: !faltanOpcionales, esencial: false },
  ];
}

/**
 * Corre una comprobación con límite de tiempo y la convierte en un `Chequeo`.
 *
 * El límite es la razón de ser de esta función. Sin él, un Firestore que no
 * contesta deja el latido colgado, el chequeo de disponibilidad se agota por su
 * cuenta y lo que queda en los registros es un silencio, no un fallo. Con él,
 * el latido contesta 503 y dice cuál dependencia se quedó muda.
 *
 * Lo que sale del error no cruza esta frontera: aquí se vuelve `ok: false`, y
 * el detalle se lo lleva `alFallar` al registro del servidor.
 */
export async function chequearConLimite(
  nombre: string,
  esencial: boolean,
  comprobar: () => Promise<unknown>,
  opciones: {
    limiteMs?: number;
    ahora?: () => number;
    alFallar?: (nombre: string, motivo: unknown) => void;
  } = {}
): Promise<Chequeo> {
  const ahora = opciones.ahora ?? (() => Date.now());
  const limiteMs = opciones.limiteMs ?? LIMITE_POR_CHEQUEO_MS;
  const inicio = ahora();

  let reloj: ReturnType<typeof setTimeout> | undefined;
  const seAgoto = Symbol('se-agoto');

  try {
    const carrera = new Promise<typeof seAgoto>((resolver) => {
      reloj = setTimeout(() => resolver(seAgoto), limiteMs);
    });
    const resultado = await Promise.race([comprobar(), carrera]);

    if (resultado === seAgoto) {
      opciones.alFallar?.(nombre, `sin respuesta en ${limiteMs} ms`);
      return { nombre, ok: false, ms: ahora() - inicio, esencial };
    }
    return { nombre, ok: true, ms: ahora() - inicio, esencial };
  } catch (error) {
    opciones.alFallar?.(nombre, error);
    return { nombre, ok: false, ms: ahora() - inicio, esencial };
  } finally {
    if (reloj) clearTimeout(reloj);
  }
}
