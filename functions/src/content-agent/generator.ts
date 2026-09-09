/**
 * @fileoverview Genera los 3 posts semanales vía la API de Gemini (misma llave
 * que ya usa daily-health-tips.ts) — pide JSON puro y lo parsea.
 */

import { callGeminiJson } from "../lib/gemini-client";
import { CONTENT_SYSTEM_PROMPT } from "./prompt";
import { WEEK_FORMATS } from "./topics";
import { StoredPost } from "./store";

const OUTPUT_FORMAT_INSTRUCTIONS = `
## Formato de salida — OBLIGATORIO
Responde ÚNICAMENTE con un objeto JSON válido, sin bloques de markdown (sin \`\`\`),
sin texto antes ni después. Estructura exacta:

{
  "posts": [
    { "weekday": "...", "hook": "...", "caption": "...", "production_note": "..." },
    { "weekday": "...", "hook": "...", "caption": "...", "production_note": "..." },
    { "weekday": "...", "hook": "...", "caption": "...", "production_note": "..." }
  ]
}

Deben ser exactamente 3 posts, en el mismo orden en que se te asignaron día/formato/tema.
`.trim();

interface RawPost {
  weekday?: string;
  hook?: string;
  caption?: string;
  production_note?: string;
}

export async function generateWeeklyPosts(topics: string[]): Promise<StoredPost[]> {
  const assignment = WEEK_FORMATS.map((f, i) => ({
    weekday: f.day,
    format_label: f.label,
    hook_example: f.hookExample,
    feature: f.feature,
    topic: topics[i],
  }));

  const system = `${CONTENT_SYSTEM_PROMPT}\n\n${OUTPUT_FORMAT_INSTRUCTIONS}`;
  const userMessage =
    "Genera los 3 posts de esta semana con esta asignación fija (no cambies día, formato ni tema):\n" +
    JSON.stringify(assignment, null, 2);

  const raw = await callGeminiJson<{ posts: RawPost[] }>(system, userMessage, {
    model: process.env.CONTENT_AGENT_MODEL,
    maxTokens: 3000,
  });

  const posts = raw.posts || [];
  if (posts.length !== WEEK_FORMATS.length) {
    throw new Error(`Se esperaban ${WEEK_FORMATS.length} posts, llegaron ${posts.length}.`);
  }

  return posts.map((p, i) => ({
    weekday: p.weekday || WEEK_FORMATS[i].day,
    formatLabel: WEEK_FORMATS[i].label,
    topic: topics[i],
    hook: p.hook || "",
    caption: p.caption || "",
    productionNote: p.production_note || "",
  }));
}
