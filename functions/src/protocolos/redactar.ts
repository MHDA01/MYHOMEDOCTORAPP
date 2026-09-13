/**
 * Agente redactor: arma el borrador de un protocolo SOLO desde el inventario de
 * recomendaciones calificadas de las guías de la biblioteca.
 *
 * Traducción exacta de protocolos/herramientas/redactar.py (el prompt y el mensaje
 * son los mismos que se midieron en el piloto). La IA no elige qué mirar: decide
 * sobre TODAS las recomendaciones y justifica cada exclusión.
 */

import { llamarGemini, UsoGemini } from "./gemini";
import type { Motivo, Recomendacion } from "./tipos";

export const MODELO_REDACTOR = "gemini-pro-latest";

export const SECCIONES: Record<string, string> = {
  preguntas_triage: "Preguntas que la Dra. Hilda debe hacer al cuidador para clasificar la gravedad.",
  signos_de_alarma: "Signos que obligan a acudir a urgencias de inmediato.",
  medidas_en_casa: "Cuidados que la guía indica para el hogar.",
  cuando_consultar: "Situaciones en que debe llevarse a consulta médica (no urgente).",
  que_no_hacer: "Prácticas que la guía desaconseja.",
  prevencion: "Medidas para prevenir nuevos episodios.",
};

export const RAZONES_EXCLUSION = [
  "dirigida_a_personal_de_salud", // exámenes, procedimientos, manejo hospitalario sin traducción útil para el hogar
  "medicamento_o_dosis", // la teleorientación no prescribe
  "fuera_del_motivo",
  "definicion_o_contexto", // definiciones, factores de riesgo, metodología
  "duplicada", // la guía repite otra recomendación ya incluida
];

export const SISTEMA = `Eres un asistente de extracción documental para un equipo médico. NO eres una fuente de conocimiento.

Recibes el INVENTARIO completo de recomendaciones calificadas de una guía oficial. Tu tarea es construir el borrador de un protocolo de teleorientación para cuidadores.

REGLAS ABSOLUTAS
1. Decide sobre CADA recomendación del inventario, sin saltarte ninguna: "incluir": true o false.
2. Si la excluyes, "razon" debe ser una de: ${RAZONES_EXCLUSION.join(", ")}.
3. Si la incluyes, genera uno o más ítems. Cada ítem:
   - "seccion": una de ${Object.keys(SECCIONES).join(", ")}.
   - "citas_literales": lista de 1 a 3 fragmentos, cada uno copiado carácter por carácter del texto de ESA recomendación (cada fragmento de 40 a 400 caracteres), incluidas sus rarezas de extracción. Si la frase necesita partes separadas de la recomendación, usa varios fragmentos; nunca los unas con "..." dentro de un mismo fragmento.
   - "texto": reformulación en español sencillo para madres, padres y cuidadores. No puede decir nada que la cita no diga: conserva conjunciones ("y" no es "o"), condiciones ("sin deshidratación"), límites de edad y cifras exactamente.
   - "adaptacion": null, o una frase que declare honestamente cómo trasladaste la recomendación al contexto de teleorientación (p. ej. "la guía lo plantea como criterio de hospitalización; aquí se presenta como signo para acudir a urgencias"). Nunca hagas una adaptación sin declararla.
   - "requiere_decision_medica": true si menciona un medicamento, suplemento, producto (p. ej. sales de rehidratación oral) o cantidades.
4. PROHIBIDO proponer medicamentos, dosis o esquemas farmacológicos como indicación: la teleorientación no prescribe (Resolución 2654 de 2019, art. 19). Esas recomendaciones se excluyen con "medicamento_o_dosis".
5. Cuando una recomendación enumera criterios de gravedad, de manejo en el hogar o de remisión a urgencias, no omitas ninguno que un cuidador pueda reconocer: crea un ítem por criterio o grupo de criterios. Omitir un signo de gravedad es un error más grave que incluir uno de más.
6. No uses conocimiento propio ni agregues contenido que no esté en el inventario. Es preferible un protocolo incompleto a una frase sin respaldo. En "vacios" anota lo que un protocolo de este motivo necesitaría y el inventario no trae.
7. Responde solo con el JSON pedido.`;

export function construirUsuario(motivo: Motivo, recs: Recomendacion[]): string {
  const esquema = {
    decisiones: [{
      rec_id: "id del inventario",
      incluir: true,
      razon: "null si se incluye; si no, una razón válida",
      items: [{
        seccion: "una sección válida",
        texto: "frase para cuidadores",
        citas_literales: ["fragmento exacto de la recomendación"],
        adaptacion: null,
        requiere_decision_medica: false,
      }],
    }],
    vacios: ["lo que falta en el inventario para este motivo"],
  };
  const secciones = Object.entries(SECCIONES).map(([k, v]) => `- ${k}: ${v}`).join("\n");
  const inventario = recs.map((r) => `[${r.rec_id}] (página ${r.pagina}) ${r.texto}`).join("\n\n");
  return (
    `MOTIVO DE CONSULTA: ${motivo.motivo} en ${motivo.edad} (curso de vida: ${motivo.curso_de_vida}).\n\n` +
    `SECCIONES DEL PROTOCOLO:\n${secciones}\n\n` +
    `FORMATO DE SALIDA (JSON):\n${JSON.stringify(esquema, null, 2)}\n\n` +
    `INVENTARIO (${recs.length} recomendaciones):\n${inventario}`
  );
}

export async function redactar(
  motivo: Motivo,
  recs: Recomendacion[],
  limiteMs: number
): Promise<{ respuesta: string; uso: UsoGemini }> {
  const { texto, uso } = await llamarGemini(MODELO_REDACTOR, SISTEMA, construirUsuario(motivo, recs), { limiteMs });
  return { respuesta: texto, uso };
}
