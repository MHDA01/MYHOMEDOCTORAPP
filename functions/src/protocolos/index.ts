/**
 * @fileoverview Agente de protocolos en la nube.
 *
 * El panel de administración crea un documento en protocolos_borradores con
 * estado "en_cola". Desde ahí, dos funciones encadenadas (cada una con su propio
 * límite de 9 minutos):
 *
 *   en_cola → redactando → por_verificar → verificando → listo
 *                     ↘ error            ↘ error
 *
 * La biblioteca cerrada vive en Cloud Storage (protocolos/biblioteca), subida desde
 * protocolos/fuentes con protocolos/herramientas/sincronizar-biblioteca.js. Antes
 * de usar el texto de una guía se comprueba su sha256 contra el registrado en
 * protocolos_fuentes: nunca se cita un texto distinto del revisado.
 *
 * Nada de esto llega a pacientes: el borrador queda esperando la revisión del médico.
 */

import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { createHash } from "crypto";
import { MODELO_REDACTOR, redactar } from "./redactar";
import { MODELO_JUEZ, juezGemini, verificar, type Item } from "./verificar";
import type { Biblioteca, Motivo, Recomendacion } from "./tipos";

try { admin.initializeApp(); } catch (_) { /* ya inicializado por otro módulo */ }

const COLECCION_BORRADORES = "protocolos_borradores";
const COLECCION_FUENTES = "protocolos_fuentes";
const RUTA_BIBLIOTECA = "protocolos/biblioteca";
const OPCIONES = { timeoutSeconds: 540, memory: "1GB" as const };
// Margen para escribir el resultado antes de que se acabe el tiempo de la función.
const LIMITE_GEMINI_MS = 480_000;

async function leerDeBiblioteca(tipo: "texto" | "inventario", fuenteId: string): Promise<unknown> {
  const fuente = await admin.firestore().collection(COLECCION_FUENTES).doc(fuenteId).get();
  if (!fuente.exists) throw new Error(`La fuente ${fuenteId} no está en la biblioteca.`);
  const esperado = fuente.get(`${tipo}_sha256`);
  const [contenido] = await admin.storage().bucket().file(`${RUTA_BIBLIOTECA}/${tipo}/${fuenteId}.json`).download();
  const real = createHash("sha256").update(contenido).digest("hex");
  if (!esperado || real !== esperado) {
    throw new Error(`El ${tipo} de ${fuenteId} no coincide con el registrado en la biblioteca (sha256).`);
  }
  return JSON.parse(contenido.toString("utf8"));
}

function bibliotecaEnLaNube(): Biblioteca {
  const paginas = new Map<string, string[]>();
  const inventarios = new Map<string, Recomendacion[]>();
  return {
    async paginas(fuenteId) {
      if (!paginas.has(fuenteId)) paginas.set(fuenteId, (await leerDeBiblioteca("texto", fuenteId)) as string[]);
      return paginas.get(fuenteId)!;
    },
    async inventario(fuenteId) {
      if (!inventarios.has(fuenteId)) {
        const datos = (await leerDeBiblioteca("inventario", fuenteId)) as { recomendaciones: Recomendacion[] };
        inventarios.set(fuenteId, datos.recomendaciones);
      }
      return inventarios.get(fuenteId)!;
    },
  };
}

/** Pasa el documento de "desde" a "hacia" solo si sigue en "desde" (los eventos pueden llegar dos veces). */
async function reclamar(ref: admin.firestore.DocumentReference, desde: string, hacia: string) {
  return admin.firestore().runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (doc.get("estado") !== desde) return null;
    tx.update(ref, { estado: hacia, actualizado_en: admin.firestore.FieldValue.serverTimestamp() });
    return doc.data()!;
  });
}

async function marcarError(ref: admin.firestore.DocumentReference, fase: string, error: unknown) {
  const mensaje = error instanceof Error ? error.message : String(error);
  functions.logger.error(`[Protocolos] Error en ${fase}`, { borrador: ref.id, mensaje });
  await ref.update({
    estado: "error",
    error: `${fase}: ${mensaje}`.slice(0, 1500),
    actualizado_en: admin.firestore.FieldValue.serverTimestamp(),
  });
}

// Firestore no acepta undefined ni listas dentro de listas; del modelo solo se
// guardan los campos que el panel usa.
const CAMPOS_ITEM = [
  "id", "rec_id", "fuente", "seccion", "texto", "citas_literales", "cita_literal", "adaptacion",
  "requiere_decision_medica", "calificacion_literal", "calificacion_verificada", "pagina",
  "revisar_fidelidad", "verificacion",
];
function itemParaGuardar(it: Item): Record<string, unknown> {
  const salida: Record<string, unknown> = {};
  for (const campo of CAMPOS_ITEM) if (it[campo] !== undefined) salida[campo] = it[campo];
  if (typeof salida.texto !== "string") salida.texto = salida.texto == null ? "" : JSON.stringify(salida.texto);
  if (salida.adaptacion != null && typeof salida.adaptacion !== "string") salida.adaptacion = JSON.stringify(salida.adaptacion);
  if (typeof salida.seccion !== "string") salida.seccion = salida.seccion == null ? null : JSON.stringify(salida.seccion);
  salida.requiere_decision_medica = !!salida.requiere_decision_medica;
  return salida;
}

export const protocolosRedactarBorrador = functions
  .runWith(OPCIONES)
  .firestore.document(`${COLECCION_BORRADORES}/{borradorId}`)
  .onCreate(async (snap) => {
    const datos = await reclamar(snap.ref, "en_cola", "redactando");
    if (!datos) return;
    try {
      const motivo = datos.motivo as Motivo;
      const biblioteca = bibliotecaEnLaNube();
      const recs: Recomendacion[] = [];
      for (const f of motivo.fuentes) recs.push(...(await biblioteca.inventario(f)));
      if (!recs.length) throw new Error("Las fuentes elegidas no tienen recomendaciones en el inventario.");

      const { respuesta, uso } = await redactar(motivo, recs, LIMITE_GEMINI_MS);
      if (uso.finishReason !== "STOP") {
        throw new Error(`el redactor no terminó su respuesta (finishReason: ${uso.finishReason}).`);
      }
      await snap.ref.collection("crudo").doc("redactor").set({
        respuesta,
        uso,
        guardado_en: admin.firestore.FieldValue.serverTimestamp(),
      });
      await snap.ref.update({
        estado: "por_verificar",
        generado: new Date().toISOString(),
        uso_redactor: uso,
        modelo_redactor: MODELO_REDACTOR,
        actualizado_en: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (error) {
      await marcarError(snap.ref, "Redacción", error);
    }
  });

export const protocolosVerificarBorrador = functions
  .runWith(OPCIONES)
  .firestore.document(`${COLECCION_BORRADORES}/{borradorId}`)
  .onUpdate(async (cambio) => {
    if (cambio.after.get("estado") !== "por_verificar" || cambio.before.get("estado") === "por_verificar") return;
    const ref = cambio.after.ref;
    const datos = await reclamar(ref, "por_verificar", "verificando");
    if (!datos) return;
    try {
      const crudo = await ref.collection("crudo").doc("redactor").get();
      if (!crudo.exists) throw new Error("no se encontró la respuesta del redactor.");
      const resultado = await verificar(
        {
          motivo: datos.motivo as Motivo,
          respuesta: crudo.get("respuesta"),
          generado: datos.generado,
          uso_redactor: datos.uso_redactor ?? {},
        },
        bibliotecaEnLaNube(),
        juezGemini(LIMITE_GEMINI_MS)
      );
      const limpio = JSON.parse(JSON.stringify({
        ...resultado,
        items: resultado.items.map(itemParaGuardar),
        decisiones_invalidas: resultado.decisiones_invalidas.map((d) => ({
          rec_id: typeof d.rec_id === "string" ? d.rec_id : JSON.stringify(d.rec_id ?? null),
          problema: d.problema,
        })),
      }));
      await ref.update({
        ...limpio,
        estado: "listo",
        modelo_juez: MODELO_JUEZ,
        terminado_en: admin.firestore.FieldValue.serverTimestamp(),
        actualizado_en: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (error) {
      await marcarError(ref, "Verificación", error);
    }
  });
