/**
 * Verificador del borrador de un protocolo.
 *
 * Traducción exacta de protocolos/herramientas/verificar.py (modo inventario):
 * 1. Sin IA: cada cita tiene que ser un fragmento literal de su recomendación y
 *    existir en el texto de la guía. Si no, el ítem se rechaza.
 * 2. Alertas por medicamentos, productos o dosis: nunca se aprueban solos.
 * 3. Criterios que la guía une con "y" y quedaron separados.
 * 4. Partes de recomendaciones incluidas que ninguna frase usó.
 * 5. Juez de fidelidad (IA distinta del redactor) con frases trampa.
 *
 * La prueba de paridad compara esta salida con la de Python sobre el piloto.
 */

import { llamarGemini, UsoGemini } from "./gemini";
import { RAZONES_EXCLUSION, SECCIONES } from "./redactar";
import { FIN_DE_ORACION, colapsarEspacios, largo, normalizar, recortar, sinEspacios } from "./texto";
import type { Biblioteca, Motivo, Recomendacion } from "./tipos";

export const MODELO_JUEZ = "gemini-3.5-flash";
const MIN_CITA = 15; // la cita ya debe salir de UNA recomendación concreta

// Los patrones de verificar.py. `\b`, `\d` y `\s` se traducen a su sentido en
// Python (Unicode), porque en JavaScript `\b` y `\d` solo conocen ASCII.
const PATRONES_MEDICAMENTO = [
  "\\b\\d+(?:[.,]\\d+)?\\s*(?:mg|ml|mcg|µg|ui|gotas|g)(?:/kg)?\\b",
  "\\bdosis\\b", "\\bmedicament", "\\bantibi[oó]tic", "\\bamoxicil", "\\bacetaminof",
  "\\bparacetam", "\\bibuprof", "\\bzinc\\b", "∫inc", "\\bondansetr", "\\bloperam",
  "\\bracecadotril", "\\bprobi[oó]tic", "\\bsuero\\b", "\\bsales de rehidrataci", "\\bsro\\b",
  "\\bjarabe\\b", "\\bvitamina", "\\bsuplement", "\\bnebuliz", "\\bsalbutamol", "\\bcorticoid",
].map((p) => new RegExp(
  p
    .replace(/\\b/g, "(?:(?<=[\\p{L}\\p{N}_])(?![\\p{L}\\p{N}_])|(?<![\\p{L}\\p{N}_])(?=[\\p{L}\\p{N}_]))")
    .replace(/\\d/g, "\\p{Nd}")
    .replace(/\\s/g, "[\\t\\n\\v\\f\\r \\x1c-\\x1f\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]"),
  "iu"
));

export type Item = Record<string, any> & {
  id: string;
  rec_id: string;
  fuente: string;
  citas_literales: string[];
  cita_literal: string;
  verificacion: { estado: "verificado" | "rechazado"; razones: string[]; alertas: string[] };
};

export interface Veredicto { id: string; fiel?: boolean; problema?: string | null }
export type Juez = (items: Item[], motivo: Motivo) => Promise<{ veredictos: Map<string, Veredicto>; uso: Record<string, unknown> }>;

export interface Verificado {
  motivo: Motivo;
  generado: string;
  uso_redactor: UsoGemini | Record<string, unknown>;
  uso_juez: Record<string, unknown> | null;
  metricas: Record<string, unknown>;
  vacios: string[];
  items: Item[];
  excluidas: Array<Recomendacion & { razon: string }>;
  sin_decision: Recomendacion[];
  partes_no_usadas: Array<{ rec_id: string; pagina: number; calificacion: string; segmentos: string[] }>;
  decisiones_invalidas: Array<{ rec_id: unknown; problema: string }>;
}

/** Texto de la guía con sus normalizaciones guardadas (se consultan cientos de veces). */
class TextoGuia {
  private pares = new Map<number, { n: string; s: string }>();
  readonly norm: string[];
  readonly sin: string[];
  constructor(readonly paginas: string[]) {
    this.norm = paginas.map(normalizar);
    this.sin = paginas.map(sinEspacios);
  }
  par(i: number): { n: string; s: string } {
    let p = this.pares.get(i);
    if (!p) {
      const t = this.paginas[i] + "\n" + this.paginas[i + 1];
      p = { n: normalizar(t), s: sinEspacios(t) };
      this.pares.set(i, p);
    }
    return p;
  }
}

/**
 * Página (1..N) donde la cita existe literalmente, o null. Primero la cita completa
 * dentro de una sola página (empezando por la declarada); solo después, cruzando
 * un salto de página.
 */
function ubicarCita(guia: TextoGuia, cita: string, pagina: number): number | null {
  const n = guia.paginas.length;
  const objetivo = normalizar(cita);
  const objetivoSin = sinEspacios(cita);
  const orden = [pagina - 1];
  for (let i = 0; i < n; i++) if (i !== pagina - 1) orden.push(i);
  for (const i of orden) {
    if (i >= 0 && i < n && (guia.norm[i].includes(objetivo) || guia.sin[i].includes(objetivoSin))) return i + 1;
  }
  for (const i of orden) {
    if (i >= 0 && i < n - 1) {
      const p = guia.par(i);
      if (p.n.includes(objetivo) || p.s.includes(objetivoSin)) return i + 1;
    }
  }
  return null;
}

function alertasMedicamento(...textos: Array<string | null | undefined>): string[] {
  const encontrados = new Set<string>();
  for (const t of textos) {
    for (const p of PATRONES_MEDICAMENTO) {
      const m = (t || "").match(p);
      if (m) encontrados.add(recortar(m[0]));
    }
  }
  return [...encontrados].sort();
}

export const juezGemini = (limiteMs: number): Juez => async (items, motivo) => {
  const sistema =
    "Eres un revisor clínico estricto. Para cada ítem decide si el TEXTO dice algo que la CITA no sostiene: " +
    "una afirmación extra, una generalización, una condición omitida (p. ej. 'sin deshidratación'), un cambio " +
    "de conjunción ('y' por 'o'), una cifra o límite de edad distinto, o una instrucción que la cita no da. " +
    "Si el ítem trae una ADAPTACIÓN declarada (p. ej. un criterio de hospitalización presentado como signo para " +
    "ir a urgencias), esa adaptación concreta ya está a la vista del médico: no la marques, pero sí cualquier " +
    "otra diferencia. " +
    `CONTEXTO: todas las frases forman parte de un protocolo sobre ${motivo.motivo.toLowerCase()} en ` +
    `${motivo.edad}; no marques como problema que la frase no repita esa población. ` +
    "No uses conocimiento propio: juzga solo contra la cita. " +
    'Responde JSON: {"items": [{"id": "...", "fiel": true|false, "problema": "texto breve o null"}]}';
  const pares: Array<Record<string, unknown>> = items.map((it) => ({
    id: it.id, texto: it.texto, cita: it.cita_literal, adaptacion: it.adaptacion ?? null,
  }));
  // Frases trampa: una fiel y una que cambia "y" por "o" (error real del primer piloto).
  // Si el juez no marca la mala, su revisión de esta corrida no es confiable.
  pares.push(
    {
      id: "canario-fiel", texto: "Lávese las manos con agua y jabón antes de preparar los alimentos del niño.",
      cita: "Se recomienda el lavado de manos con agua y jabón antes de preparar los alimentos del niño.", adaptacion: null,
    },
    {
      id: "canario-infiel", texto: "Acuda si tiene 10 o más deposiciones en 24 horas o 5 o más vómitos en 4 horas.",
      cita: "factores de riesgo para muerte (diez o más deposiciones diarreicas en las últimas 24 horas y cinco o más vómitos en las últimas 4 horas)",
      adaptacion: null,
    },
  );
  const { texto, uso } = await llamarGemini(MODELO_JUEZ, sistema, JSON.stringify(pares), { temperatura: 0.0, limiteMs });
  const veredictos = new Map<string, Veredicto>();
  for (const r of (JSON.parse(texto)?.items ?? []) as Veredicto[]) {
    if (r && typeof r.id === "string") veredictos.set(r.id, r);
  }
  return {
    veredictos,
    uso: {
      ...uso,
      juez_confiable: veredictos.get("canario-infiel")?.fiel === false && veredictos.get("canario-fiel")?.fiel === true,
    },
  };
};

export async function verificar(
  entrada: { motivo: Motivo; respuesta: string; generado: string; uso_redactor: Record<string, unknown> },
  biblioteca: Biblioteca,
  juez: Juez
): Promise<Verificado> {
  const { motivo } = entrada;
  const borrador = JSON.parse(entrada.respuesta);

  const recs = new Map<string, Recomendacion>();
  for (const f of motivo.fuentes) for (const r of await biblioteca.inventario(f)) recs.set(r.rec_id, r);
  const guias = new Map<string, TextoGuia>();
  const guia = async (fuente: string): Promise<TextoGuia> => {
    let g = guias.get(fuente);
    if (!g) {
      g = new TextoGuia(await biblioteca.paginas(fuente));
      guias.set(fuente, g);
    }
    return g;
  };

  const items: Item[] = [];
  const excluidas: Verificado["excluidas"] = [];
  const invalidas: Verificado["decisiones_invalidas"] = [];
  const vistas = new Set<string>();

  for (const d of (Array.isArray(borrador?.decisiones) ? borrador.decisiones : []) as any[]) {
    const recId = d?.rec_id;
    if (typeof recId !== "string" || !recs.has(recId) || vistas.has(recId)) {
      invalidas.push({ rec_id: recId ?? null, problema: typeof recId === "string" && recs.has(recId) ? "decisión repetida" : "no existe en el inventario" });
      continue;
    }
    vistas.add(recId);
    const rec = recs.get(recId)!;
    const fuente = recId.split("#")[0];

    if (!d.incluir) {
      const razon = RAZONES_EXCLUSION.includes(d.razon) ? d.razon : `razón no válida: ${d.razon ?? "None"}`;
      excluidas.push({ ...rec, razon });
      continue;
    }

    for (const bruto of (Array.isArray(d.items) ? d.items : []) as any[]) {
      if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) {
        invalidas.push({ rec_id: recId, problema: "ítem mal formado" });
        continue;
      }
      const razones: string[] = [];
      const alertas: string[] = [];
      let citasBrutas: unknown[] = [];
      if (Array.isArray(bruto.citas_literales) && bruto.citas_literales.length) citasBrutas = bruto.citas_literales;
      else if (bruto.cita_literal) citasBrutas = [bruto.cita_literal];
      const citas = citasBrutas.map((c, n) => {
        if (typeof c === "string") return c;
        razones.push(`fragmento ${n + 1} no es texto`);
        return JSON.stringify(c);
      });
      const it = {
        ...bruto,
        id: `i${items.length + 1}`,
        rec_id: recId,
        fuente,
        calificacion_literal: rec.calificacion,
        calificacion_verificada: true,
        citas_literales: citas,
        cita_literal: citas.join(" … "), // para mostrar y para el juez
      } as Item;

      if (!(typeof it.seccion === "string" && Object.prototype.hasOwnProperty.call(SECCIONES, it.seccion))) razones.push(`sección no válida: ${it.seccion ?? "None"}`);
      if (!citas.length) razones.push("sin cita");
      for (let n = 1; n <= citas.length; n++) {
        const cita = citas[n - 1];
        if (typeof citasBrutas[n - 1] !== "string") continue;
        if (largo(normalizar(cita)) < MIN_CITA) {
          razones.push(`fragmento ${n} demasiado corto para verificarlo`);
        } else if (!(normalizar(rec.texto).includes(normalizar(cita)) || sinEspacios(rec.texto).includes(sinEspacios(cita)))) {
          razones.push(`el fragmento ${n} no es literal de la recomendación que dice usar`);
        } else {
          const pagina = ubicarCita(await guia(fuente), cita, rec.pagina);
          if (pagina === null) razones.push(`el fragmento ${n} no existe literalmente en el PDF`);
          else if (n === 1) it.pagina = pagina;
        }
      }

      if (it.adaptacion) alertas.push("adaptación declarada: " + it.adaptacion);
      const meds = alertasMedicamento(typeof it.texto === "string" ? it.texto : "", it.cita_literal);
      if (meds.length) alertas.push("menciona medicamento, producto o dosis: " + meds.join(", "));
      if (meds.length || it.requiere_decision_medica) it.requiere_decision_medica = true;

      it.verificacion = { estado: razones.length ? "rechazado" : "verificado", razones, alertas };
      items.push(it);
    }
  }

  const sinDecision = [...recs.entries()].filter(([rid]) => !vistas.has(rid)).map(([, r]) => r);

  // Criterios que la guía une con "y" y la IA separó en frases independientes: cada
  // frase es fiel a su fragmento, pero el criterio clínico cambia.
  const verificables = items.filter((i) => i.verificacion.estado === "verificado");
  for (const a of verificables) {
    for (const b of verificables) {
      if (a === b || a.rec_id !== b.rec_id) continue;
      const textoRec = normalizar(recs.get(a.rec_id)!.texto);
      for (const ca of a.citas_literales) {
        for (const cb of b.citas_literales) {
          if (textoRec.includes(`${normalizar(ca)} y ${normalizar(cb)}`)) {
            for (const [it, otro] of [[a, b], [b, a]] as Array<[Item, Item]>) {
              const aviso = `fidelidad: la guía exige este criterio JUNTO con ${otro.id} (los une con 'y'); aquí quedaron separados`;
              if (!it.verificacion.alertas.includes(aviso)) {
                it.verificacion.alertas.push(aviso);
                it.revisar_fidelidad = true;
              }
            }
          }
        }
      }
    }
  }

  // Partes de cada recomendación INCLUIDA que ninguna frase usó.
  const partesNoUsadas: Verificado["partes_no_usadas"] = [];
  for (const rid of new Set(items.map((i) => i.rec_id))) {
    const usadas = items
      .filter((i) => i.rec_id === rid && i.verificacion.estado === "verificado")
      .flatMap((i) => i.citas_literales.map(sinEspacios));
    const continuo = colapsarEspacios(recs.get(rid)!.texto); // los saltos de línea del PDF no son frases
    const segmentos = continuo.split(FIN_DE_ORACION).map(recortar).filter((s) => largo(s) >= 30);
    const cubierto = (seg: string): boolean => {
      // Ventanas de 30 caracteres cada 10; cuenta como usado si al menos el 40 % aparece en alguna cita.
      const s = Array.from(sinEspacios(seg));
      const ventanas: string[] = [];
      for (let k = 0; k < Math.max(1, s.length - 29); k += 10) ventanas.push(s.slice(k, k + 30).join(""));
      return ventanas.filter((v) => usadas.some((u) => u.includes(v))).length >= ventanas.length * 0.4;
    };
    const faltan = segmentos.filter((seg) => !cubierto(seg));
    if (faltan.length) {
      const r = recs.get(rid)!;
      partesNoUsadas.push({ rec_id: rid, pagina: r.pagina, calificacion: r.calificacion, segmentos: faltan });
    }
  }

  const verificados = items.filter((i) => i.verificacion.estado === "verificado");
  let usoJuez: Record<string, unknown> | null = null;
  if (verificados.length) {
    const { veredictos, uso } = await juez(verificados, motivo);
    usoJuez = uso;
    for (const it of verificados) {
      const v = veredictos.get(it.id);
      if (v && v.fiel === false) {
        it.verificacion.alertas.push("fidelidad: " + (v.problema || "el texto va más allá de la cita"));
        it.revisar_fidelidad = true;
      }
    }
  }

  const razonesExclusion: Record<string, number> = {};
  for (const e of excluidas) razonesExclusion[e.razon] = (razonesExclusion[e.razon] ?? 0) + 1;
  const metricas = {
    recomendaciones_en_inventario: recs.size,
    con_decision: vistas.size,
    sin_decision: sinDecision.length,
    decisiones_invalidas: invalidas.length,
    recomendaciones_incluidas: new Set(items.map((i) => i.rec_id)).size,
    recomendaciones_excluidas: excluidas.length,
    exclusiones_por_razon: razonesExclusion,
    items_propuestos: items.length,
    rechazados_por_cita: items.filter((i) => i.verificacion.estado === "rechazado").length,
    verificados: verificados.length,
    con_adaptacion_declarada: verificados.filter((i) => i.adaptacion).length,
    requieren_decision_medica: verificados.filter((i) => i.requiere_decision_medica).length,
    marcados_por_fidelidad: verificados.filter((i) => i.revisar_fidelidad).length,
    recomendaciones_incluidas_con_partes_sin_usar: partesNoUsadas.length,
  };

  return {
    motivo,
    generado: entrada.generado,
    uso_redactor: entrada.uso_redactor,
    uso_juez: usoJuez,
    metricas,
    vacios: Array.isArray(borrador?.vacios) ? borrador.vacios.filter((v: unknown) => typeof v === "string") : [],
    items,
    excluidas,
    sin_decision: sinDecision,
    partes_no_usadas: partesNoUsadas.sort((a, b) => a.pagina - b.pagina),
    decisiones_invalidas: invalidas,
  };
}
