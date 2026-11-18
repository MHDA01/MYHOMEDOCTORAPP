// ============================================================
// app/actions/admin-reglas.ts — la base de reglas del grafo, desde el panel.
//
// Es la puerta por la que una regla aprobada por el médico responsable empieza a
// decidir conducta en producción, sin un despliegue de código. Lo que hay detrás
// está en src/lib/base-de-reglas-guardada.ts; aquí solo se comprueba quién
// llama, se traduce lo que escribe a algo que el servidor pueda validar, y se
// deja constancia.
//
// Tres cosas que esta acción NO hace, y ninguna es un olvido:
//
// - **No aprueba nada.** La firma del médico viaja dentro de cada regla
//   (`aprobadoPor`), la pone quien prepara la base y `revisarBase()` la exige.
//   Un botón aquí que dijera "aprobar" sería una firma puesta por el panel.
// - **No construye reglas.** Entra una base entera, en JSON, que sale de la
//   fábrica de `protocolos/`. Escribir condiciones a mano en un formulario es
//   otro trabajo, y hacerlo mal es peor que no tenerlo.
// - **No se salta ninguna revisión.** Publica exactamente lo que la lectura del
//   turno va a aceptar, porque llama a la misma función.
// ============================================================
'use server';

import { verifyAdminAccess } from '@/lib/admin-access';
import {
  diagnosticarBasePublicada,
  publicarBase,
  retirarBasePublicada,
  type DiagnosticoBase,
} from '@/lib/base-de-reglas-guardada';
import { desdeFirestore } from '@/lib/reglas-desde-firestore';
import { revisarBase, type BaseDeReglas } from '@/lib/grafo-reglas';
import { compararBases, pesoDelCambio, type CambiosDeBase } from '@/lib/cambios-de-reglas';

type Resultado<T> = { success: true; data: T } | { success: false; error: string };

export interface RevisionCandidata {
  /** Vacío quiere decir que esta base se puede publicar. */
  problemas: string[];
  /** Qué cambiaría respecto a lo que hay publicado ahora. `null` si no se pudo leer. */
  cambios: CambiosDeBase | null;
  peso: ReturnType<typeof pesoDelCambio> | null;
  /** Cuántas reglas de cada clase trae la base candidata. */
  conteos: Record<keyof BaseDeReglas, number>;
}

function conteos(base: BaseDeReglas): Record<keyof BaseDeReglas, number> {
  return {
    alarmas: base.alarmas.length,
    activadores: base.activadores.length,
    sindromes: base.sindromes.length,
    susceptibilidades: base.susceptibilidades.length,
    escalas: base.escalas.length,
    arboles: base.arboles.length,
  };
}

/**
 * De lo que el médico pega a un objeto, con un mensaje que se entienda.
 *
 * `JSON.parse` dice "Unexpected token } in JSON at position 1420", que no sirve
 * a nadie. Aquí se dice qué pasó y dónde, y no se sigue adelante: una base a
 * medio leer no se valida, se rechaza.
 */
function leerJson(texto: string): { ok: true; valor: unknown } | { ok: false; error: string } {
  const limpio = texto.trim();
  if (!limpio) return { ok: false, error: 'No hay nada que publicar: el documento está vacío.' };
  try {
    return { ok: true, valor: JSON.parse(limpio) };
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `El documento no es JSON válido. ${detalle}` };
  }
}

/** Qué hay publicado, si está en uso y, si no, por qué. */
export async function verBaseDeReglasAdmin(idToken: string): Promise<Resultado<DiagnosticoBase>> {
  const acceso = await verifyAdminAccess(idToken);
  if (!acceso.ok) return { success: false, error: acceso.error };

  try {
    return { success: true, data: await diagnosticarBasePublicada() };
  } catch (error) {
    console.error('[Admin reglas] Error leyendo la base publicada:', error);
    return { success: false, error: 'No se pudo leer la base de reglas publicada.' };
  }
}

/**
 * Revisa una base candidata sin escribir nada.
 *
 * Es el paso que hace que publicar no sea a ciegas. Devuelve los problemas si
 * los hay y, si no, **qué cambiaría**: lo que entra, lo que sale y lo que
 * cambia. El que importa es lo que sale, porque publicar es un acto sobre la
 * base completa y una base pegada sin una alarma la retira sin avisar.
 */
export async function revisarBaseCandidataAdmin(
  idToken: string,
  texto: string
): Promise<Resultado<RevisionCandidata>> {
  const acceso = await verifyAdminAccess(idToken);
  if (!acceso.ok) return { success: false, error: acceso.error };

  const json = leerJson(texto);
  if (!json.ok) return { success: false, error: json.error };

  const { base, problemas } = desdeFirestore(json.valor);
  if (problemas.length) {
    return { success: true, data: { problemas, cambios: null, peso: null, conteos: conteos(base) } };
  }

  const deLaCasa = revisarBase(base);
  if (deLaCasa.length) {
    return { success: true, data: { problemas: deLaCasa, cambios: null, peso: null, conteos: conteos(base) } };
  }

  try {
    const actual = await diagnosticarBasePublicada();
    const cambios = compararBases(actual.base, base);
    return {
      success: true,
      data: { problemas: [], cambios, peso: pesoDelCambio(cambios), conteos: conteos(base) },
    };
  } catch (error) {
    console.error('[Admin reglas] Error comparando con la base publicada:', error);
    return { success: false, error: 'La base está bien, pero no se pudo comparar con la publicada.' };
  }
}

/**
 * Publica la base. Vuelve a validar todo antes de escribir.
 *
 * Se valida dos veces —aquí y en la revisión de antes— a propósito: entre una y
 * otra pasó el tiempo que el médico tardó en leer los cambios, y lo que se
 * escribe tiene que ser lo que se validó, no lo que se validó hace un rato.
 */
export async function publicarBaseDeReglasAdmin(
  idToken: string,
  texto: string,
  nota: string
): Promise<Resultado<{ conteos: Record<keyof BaseDeReglas, number> }>> {
  const acceso = await verifyAdminAccess(idToken);
  if (!acceso.ok) return { success: false, error: acceso.error };

  const json = leerJson(texto);
  if (!json.ok) return { success: false, error: json.error };

  try {
    const r = await publicarBase(json.valor, acceso.email, nota.trim() || undefined);
    if (!r.ok) {
      return {
        success: false,
        error: `La base no se publicó. ${r.problemas.length} problema(s): ${r.problemas.slice(0, 3).join('; ')}`,
      };
    }
    // Queda escrito quién puso a decidir qué, que es la mitad del expediente de
    // validación que pide la Res. 1644. Los logs de Next se buscan por texto.
    console.log(
      `[Admin reglas] Base publicada por ${acceso.email}: ${r.enUso.alarmas.length} alarma(s), ` +
        `${r.enUso.activadores.length} activador(es), ${r.enUso.sindromes.length} síndrome(s), ` +
        `${r.enUso.arboles.length} árbol(es)`
    );
    return { success: true, data: { conteos: conteos(r.enUso) } };
  } catch (error) {
    console.error('[Admin reglas] Error publicando la base:', error);
    return { success: false, error: 'No se pudo escribir la base de reglas.' };
  }
}

/**
 * Retira la base publicada: el grafo vuelve a correr en vacío.
 *
 * El interruptor de pánico. Si una regla está escalando a quien no debe, esto la
 * apaga sin un despliegue. Deja de decidir **todo** el expediente determinista,
 * no una regla: para quitar una sola, se publica la base sin ella.
 */
export async function retirarBaseDeReglasAdmin(idToken: string): Promise<Resultado<null>> {
  const acceso = await verifyAdminAccess(idToken);
  if (!acceso.ok) return { success: false, error: acceso.error };

  try {
    await retirarBasePublicada();
    console.log(`[Admin reglas] Base de reglas RETIRADA por ${acceso.email}: el grafo corre en vacío`);
    return { success: true, data: null };
  } catch (error) {
    console.error('[Admin reglas] Error retirando la base:', error);
    return { success: false, error: 'No se pudo retirar la base de reglas.' };
  }
}
