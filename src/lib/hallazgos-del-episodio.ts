/**
 * Dónde viven los hallazgos de HOY de una consulta. Solo servidor.
 *
 * Es la pieza que faltaba para que el grafo sirviera de algo en el chat. El
 * extractor ya convertía lo que la persona dice en hallazgos tipados, pero solo
 * sobrevivían los **antecedentes**: `incorporarHallazgos()` descarta lo del
 * episodio y lo dice en su comentario —"pertenecen al episodio (§11), que
 * todavía no existe"—. Y las alarmas del ejecutor corren justamente sobre los
 * hallazgos `actual`. Sin esta casa, el grafo miraba cada turno como si la
 * persona acabara de llegar.
 *
 * `fichas_clinicas/{uid}/episodios/{convId}`. Cuelga de la ficha para heredar
 * dos cosas que ya están bien resueltas: el `allow read, write: if false` del
 * comodín recursivo de `firestore.rules`, y el borrado con la cuenta
 * (`datos-de-la-cuenta.ts` hace `recursiveDelete` del documento del uid). No es
 * la ficha, y el nombre lo dice: la ficha es lo estable de la persona, esto es
 * lo de esta consulta.
 *
 * **Que el navegador no escriba aquí es el punto**, igual que con la ficha: cada
 * hallazgo pasó por `registrar()`, que exige la frase literal de la que salió.
 * Un hallazgo escrito desde el cliente se saltaría esa prueba, y es la que hace
 * confiable al extractor.
 *
 * ⚠️ **Guarda la frase literal de la persona, en claro.** Es el mismo trato que
 * ya recibe el `detalle` de la ficha, y por la misma razón: `registrar()` no
 * admite un hallazgo del relato sin su cita. Los mensajes del chat sí se cifran,
 * así que la asimetría existe y es deliberada, no un descuido. Si la decisión
 * cambia, se cambia aquí y en `ficha-guardada.ts`, que son los dos sitios.
 */

import { getAdminDb } from '@/lib/firebase-admin';
import {
  COLECCION_FICHAS,
  SUBCOLECCION_EPISODIOS,
} from '@/lib/constants';
import { registrar, type HallazgoRegistrado } from '@/lib/hallazgos';

function refEpisodio(uid: string, convId: string) {
  return getAdminDb()
    .collection(COLECCION_FICHAS)
    .doc(uid)
    .collection(SUBCOLECCION_EPISODIOS)
    .doc(convId);
}

/**
 * Vuelve a pasar por `registrar()` lo que estaba guardado.
 *
 * Podría parecer de más —lo escribimos nosotros, ya estaba validado— y no lo
 * es: `registrar()` es el único camino por el que un hallazgo puede existir, y
 * un documento guardado el mes pasado puede traer un `id` que ya no está en el
 * vocabulario, un campo que cambió de forma o una edición a mano. Lo que no
 * pasa se queda fuera con su motivo en el log, en vez de entrar a decidir
 * conducta sin haber sido validado nunca.
 */
export function desdeFirestore(crudos: unknown): {
  hallazgos: HallazgoRegistrado[];
  rechazados: string[];
} {
  if (!Array.isArray(crudos)) return { hallazgos: [], rechazados: [] };

  const hallazgos: HallazgoRegistrado[] = [];
  const rechazados: string[] = [];

  for (const crudo of crudos) {
    if (!crudo || typeof crudo !== 'object') {
      rechazados.push('una entrada que no es un objeto');
      continue;
    }
    const registro = registrar(crudo as Parameters<typeof registrar>[0]);
    if (registro.ok) hallazgos.push(registro.hallazgo);
    else rechazados.push(registro.motivo);
  }

  return { hallazgos, rechazados };
}

/**
 * Los hallazgos del episodio, o lista vacía si no hay ninguno todavía.
 *
 * Nunca lanza y nunca devuelve `null`: aquí "no hay nada guardado" y "no se
 * pudo leer" llevan al mismo sitio —el grafo corre con lo de este turno— y un
 * fallo leyendo esto no puede dejar sin orientación a quien está preguntando.
 */
export async function leerHallazgosDelEpisodio(
  uid: string,
  convId: string
): Promise<HallazgoRegistrado[]> {
  try {
    const snap = await refEpisodio(uid, convId).get();
    if (!snap.exists) return [];
    const { hallazgos, rechazados } = desdeFirestore(snap.get('hallazgos'));
    if (rechazados.length) {
      console.error(
        `[Dra. Hilda] Episodio: ${rechazados.length} hallazgo(s) guardado(s) ya no pasan la ` +
          `validación y no entran (${rechazados.slice(0, 3).join('; ')})`
      );
    }
    return hallazgos;
  } catch (error) {
    console.error('[Dra. Hilda] Error leyendo los hallazgos del episodio:', error);
    return [];
  }
}

/**
 * Guarda los hallazgos del episodio, completos.
 *
 * Se escribe el arreglo entero y no se mezcla por hallazgo porque quien llama ya
 * acumuló (`acumular()` en `grafo-del-turno.ts`): esa función es la que sabe que
 * lo nuevo va delante y que la clave es `id` + `temporalidad`. Mezclar aquí
 * abriría la puerta a que dos turnos a la vez se pisen sin que nadie lo note,
 * que es el mismo argumento de `guardarFicha`.
 *
 * `undefined` no se puede escribir en Firestore y `HallazgoRegistrado` tiene
 * media docena de campos opcionales, así que se limpian antes.
 */
export async function guardarHallazgosDelEpisodio(
  uid: string,
  convId: string,
  hallazgos: readonly HallazgoRegistrado[]
): Promise<void> {
  await refEpisodio(uid, convId).set(
    {
      hallazgos: hallazgos.map(sinUndefined),
      actualizado: new Date().toISOString().slice(0, 10),
    },
    { merge: false }
  );
}

function sinUndefined(h: HallazgoRegistrado): Record<string, unknown> {
  return Object.fromEntries(Object.entries(h).filter(([, v]) => v !== undefined));
}
