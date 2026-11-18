/**
 * La base de reglas del grafo, leída de Firestore. Solo servidor.
 *
 * Esto es lo que faltaba para que la promesa de `base-de-reglas.ts` fuera
 * verdad. Allí dice que el día que el médico responsable apruebe el primer
 * activador "entra y empieza a decidir sin tocar el chat", y hasta hoy eso
 * exigía editar un archivo de `src/` y volver a desplegar la aplicación: un
 * despliegue de código por cada regla clínica aprobada. Con esto, publicar una
 * regla es escribir un documento, y el turno siguiente ya la recorre.
 *
 * `reglas_del_grafo/publicada`, un solo documento con la base entera. El por qué
 * de un documento y no uno por regla está en `constants.ts`, donde se declara la
 * colección: publicar es un acto sobre la base completa porque las reglas se
 * referencian entre sí.
 *
 * ── LAS CUATRO BARANDAS ──
 *
 * 1. **Nada entra sin pasar las dos revisiones.** Primero el analizador de
 *    `reglas-desde-firestore.ts` (¿tiene forma de base de reglas?) y después
 *    `revisarBase()` (¿cumple las reglas de la casa: fuente, firma, ninguna
 *    alarma que exija un antecedente, ningún "síndrome" dicho al paciente?). Un
 *    problema cualquiera en cualquiera de las dos y la base publicada **no se
 *    usa**: se corre en vacío, como hasta ahora.
 * 2. **El fallo es siempre hacia la base vacía, nunca hacia media base.** Correr
 *    sin reglas es un estado conocido, que el log nombra con esas palabras y que
 *    no decide nada. Correr con la mitad de las reglas no es un estado: es una
 *    base distinta de la que el médico aprobó.
 * 3. **Nunca lanza.** Esto se lee dentro de un turno de consulta. Un fallo de
 *    Firestore no puede dejar sin orientación a quien está preguntando, igual
 *    que en `leerHallazgosDelEpisodio()`.
 * 4. **El código manda sobre los datos en una sola dirección.** `revisarBase()`
 *    vive en `src/` y se despliega con la aplicación, así que una regla
 *    publicada no puede saltarse una baranda nueva: si mañana se prohíbe algo
 *    más, la base que ya estaba publicada deja de pasar y se apaga sola.
 *
 * **Lo que esto NO es.** No es el panel de Administración → Protocolos. Es la
 * toma a la que ese panel se enchufará: el panel tendrá que mostrar la base,
 * dejar aprobar activador por activador y llamar a `publicarBase()`. Mientras no
 * exista, `publicarBase()` es la única puerta, y por eso valida lo mismo que
 * validaría el panel en vez de confiar en quien la llame.
 */

import { getAdminDb } from '@/lib/firebase-admin';
import { COLECCION_REGLAS, DOC_REGLAS_PUBLICADA } from '@/lib/constants';
import { type BaseDeReglas, BASE_VACIA, revisarBase } from '@/lib/grafo-reglas';
import { desdeFirestore } from '@/lib/reglas-desde-firestore';

/**
 * Cuánto se guarda en memoria lo leído.
 *
 * El grafo corre en **cada** turno, así que sin caché esto sería una lectura de
 * Firestore por mensaje de cada consulta del país, para traer un documento que
 * cambia cuando el médico aprueba algo: unas cuantas veces al mes.
 *
 * Un minuto es el equilibrio que importa: acota el gasto a una lectura por
 * minuto y por instancia, y acota también lo que tarda en apagarse una regla
 * **retirada**. Ese es el lado que fija el número; una regla nueva puede esperar
 * un minuto, una que el médico acaba de quitar no tanto. Si algún día hace falta
 * que sea inmediato, `olvidarCache()` ya está aquí y `publicarBase()` la llama.
 */
export const VIGENCIA_CACHE_MS = 60_000;

/**
 * Tope de tamaño al publicar.
 *
 * Un documento de Firestore no pasa de 1 MB y la base entera va en uno solo, así
 * que una base con muchos árboles —cada desenlace lleva sus textos aprobados—
 * podría chocar contra el límite. Se avisa al publicar, con el tamaño, en vez de
 * dejar que Firestore rechace la escritura con un error que no explica nada. El
 * día que se acerque, la salida es partir los árboles a su propia colección.
 */
export const TOPE_BYTES = 900_000;

let cache: { base: BaseDeReglas; hasta: number } | null = null;

function ref() {
  return getAdminDb().collection(COLECCION_REGLAS).doc(DOC_REGLAS_PUBLICADA);
}

/** Para las pruebas y para `publicarBase()`: la próxima lectura va a Firestore. */
export function olvidarCache(): void {
  cache = null;
}

function recordar(base: BaseDeReglas): BaseDeReglas {
  cache = { base, hasta: Date.now() + VIGENCIA_CACHE_MS };
  return base;
}

/**
 * La base con la que va a correr este turno.
 *
 * Devuelve `BASE_VACIA` cuando no hay nada publicado, cuando lo publicado no
 * pasa las revisiones y cuando Firestore falla. Los tres casos llevan al mismo
 * sitio —el grafo recorre y no dispara— pero no al mismo log: el segundo y el
 * tercero son problemas y se gritan, el primero es el estado normal de hoy y lo
 * dice ya `resumenParaLog()` con "la base de reglas no tiene nada aprobado".
 */
export async function leerBasePublicada(): Promise<BaseDeReglas> {
  if (cache && Date.now() < cache.hasta) return cache.base;

  try {
    const snap = await ref().get();
    if (!snap.exists) return recordar(BASE_VACIA);

    const { base, problemas } = desdeFirestore(snap.get('base'));
    if (problemas.length) {
      // Se cachea la base vacía igual que si estuviera bien: si lo publicado
      // está roto, reintentarlo en cada turno no lo arregla y sí multiplica la
      // lectura y el ruido en el log.
      console.error(
        `[Dra. Hilda] Base de reglas: lo publicado NO se está usando, ${problemas.length} ` +
          `problema(s) de forma. El grafo corre en vacío. (${problemas.slice(0, 5).join('; ')})`
      );
      return recordar(BASE_VACIA);
    }

    const deLaCasa = revisarBase(base);
    if (deLaCasa.length) {
      console.error(
        `[Dra. Hilda] Base de reglas: lo publicado NO se está usando, ${deLaCasa.length} ` +
          `problema(s) del revisor. El grafo corre en vacío. (${deLaCasa.slice(0, 5).join('; ')})`
      );
      return recordar(BASE_VACIA);
    }

    // Que una base aprobada esté decidiendo conducta es un hecho que tiene que
    // quedar escrito, y los logs de Next no traen severity: se busca por texto.
    console.log(
      `[Dra. Hilda] Base de reglas: en uso, ${base.alarmas.length} alarma(s), ` +
        `${base.activadores.length} activador(es), ${base.sindromes.length} síndrome(s), ` +
        `${base.susceptibilidades.length} susceptibilidad(es), ${base.escalas.length} escala(s), ` +
        `${base.arboles.length} árbol(es)`
    );
    return recordar(base);
  } catch (error) {
    // Sin cachear a propósito: esto es un fallo de red o de permisos, no un
    // problema de lo publicado, y el turno siguiente tiene que volver a probar.
    console.error('[Dra. Hilda] Error leyendo la base de reglas publicada:', error);
    return BASE_VACIA;
  }
}

export interface DiagnosticoBase {
  /** Si el documento existe, aunque no se esté usando. */
  hayDocumento: boolean;
  /** Si lo publicado pasa las dos revisiones y de verdad está decidiendo. */
  enUso: boolean;
  /** Por qué no se usa, cuando no se usa. Vacío si todo está bien. */
  problemas: string[];
  /** La base normalizada, o la vacía si no se puede usar. */
  base: BaseDeReglas;
  publicadaPor: string | null;
  /** AAAA-MM-DDTHH:mm:ss.sssZ, o `null`. Para el navegador, que no entiende Timestamp. */
  publicadaEn: string | null;
  nota: string | null;
  /** El documento tal como está guardado, para poder corregirlo y republicarlo. */
  json: string | null;
}

/**
 * Lo mismo que hace la lectura del turno, pero contándolo todo y sin caché.
 *
 * Es para la pantalla de Administración, y existe porque `leerBasePublicada()`
 * se guarda los detalles a propósito: al turno de la consulta solo le importa
 * con qué correr. Aquí hace falta lo contrario —qué hay publicado, si está en
 * uso y, si no, exactamente por qué—, porque una base publicada que no pasa las
 * revisiones es invisible desde la app: el grafo corre en vacío igual que si no
 * hubiera nada, y nadie mira el log.
 *
 * Sin caché para que el panel no muestre lo de hace un minuto justo después de
 * publicar.
 */
export async function diagnosticarBasePublicada(): Promise<DiagnosticoBase> {
  const vacio: DiagnosticoBase = {
    hayDocumento: false,
    enUso: false,
    problemas: [],
    base: BASE_VACIA,
    publicadaPor: null,
    publicadaEn: null,
    nota: null,
    json: null,
  };

  const snap = await ref().get();
  if (!snap.exists) return vacio;

  const crudo = snap.get('base');
  const publicadaEn = snap.get('publicadaEn');
  const comun = {
    hayDocumento: true,
    publicadaPor: typeof snap.get('publicadaPor') === 'string' ? (snap.get('publicadaPor') as string) : null,
    publicadaEn:
      publicadaEn && typeof publicadaEn.toDate === 'function'
        ? (publicadaEn.toDate() as Date).toISOString()
        : null,
    nota: typeof snap.get('nota') === 'string' ? (snap.get('nota') as string) : null,
    json: JSON.stringify(crudo ?? null, null, 2),
  };

  const { base, problemas } = desdeFirestore(crudo);
  if (problemas.length) return { ...vacio, ...comun, problemas, base: BASE_VACIA };

  const deLaCasa = revisarBase(base);
  if (deLaCasa.length) return { ...vacio, ...comun, problemas: deLaCasa, base: BASE_VACIA };

  return { ...comun, enUso: true, problemas: [], base };
}

export type ResultadoPublicar =
  | { ok: true; enUso: BaseDeReglas }
  | { ok: false; problemas: string[] };

/**
 * Publica una base de reglas, si pasa todo lo que tendría que pasar.
 *
 * Valida con las **mismas dos revisiones** que hace la lectura, y a propósito:
 * publicar algo que la lectura va a rechazar dejaría el grafo en vacío con un
 * documento que parece publicado, que es la peor de las combinaciones —nadie
 * mira el log de un despliegue que no falló—. Si no pasa, no se escribe nada y
 * se devuelven los problemas para que los lea quien publica.
 *
 * Lo que se escribe es la base **normalizada** que devuelve el analizador, no lo
 * que entró: los campos de más se cayeron y no queda ningún `undefined`, que
 * Firestore no admite.
 */
export async function publicarBase(
  entrada: unknown,
  porCorreo: string,
  nota?: string
): Promise<ResultadoPublicar> {
  const { base, problemas } = desdeFirestore(entrada);
  if (problemas.length) return { ok: false, problemas };

  const deLaCasa = revisarBase(base);
  if (deLaCasa.length) return { ok: false, problemas: deLaCasa };

  const bytes = Buffer.byteLength(JSON.stringify(base), 'utf8');
  if (bytes > TOPE_BYTES) {
    return {
      ok: false,
      problemas: [
        `la base pesa ${bytes} bytes y el tope es ${TOPE_BYTES}: un documento de Firestore no ` +
          `pasa de 1 MB`,
      ],
    };
  }

  await ref().set(
    { base, publicadaEn: new Date(), publicadaPor: porCorreo, ...(nota ? { nota } : {}) },
    { merge: false }
  );
  olvidarCache();
  return { ok: true, enUso: base };
}

/**
 * Retira la base publicada: el grafo vuelve a correr en vacío.
 *
 * Es el interruptor de pánico. Si una regla aprobada está escalando a quien no
 * debe, esto la apaga sin un despliegue y sin tocar el chat, que es la otra
 * mitad de la razón para que la base viva en datos.
 */
export async function retirarBasePublicada(): Promise<void> {
  await ref().delete();
  olvidarCache();
}
