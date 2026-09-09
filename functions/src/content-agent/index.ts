/**
 * @fileoverview Cloud Functions del agente de contenido semanal.
 * Genera 3 borradores de post (lunes/miércoles/viernes) rotando temas y formatos,
 * y los envía por correo para revisión — nunca publica solo. Programar en Meta
 * Business Suite (Planificador) sigue siendo una acción manual y deliberada.
 */

import * as functions from "firebase-functions/v1";
import { takeNextTopics, savePlan, StoredPost } from "./store";
import { generateWeeklyPosts } from "./generator";
import { sendEmail } from "../email";
import { WEEK_FORMATS } from "./topics";

const CONTENT_AGENT_EMAIL_TO = process.env.CONTENT_AGENT_EMAIL_TO || "marketing@myhomedoctorapp.com";
const CONTENT_AGENT_TRIGGER_SECRET = process.env.CONTENT_AGENT_TRIGGER_SECRET;

function nextMondayId(): string {
  const now = new Date();
  const bogota = new Date(now.toLocaleString("en-US", { timeZone: "America/Bogota" }));
  const daysUntilMonday = (8 - bogota.getDay()) % 7 || 7;
  bogota.setDate(bogota.getDate() + daysUntilMonday);
  const yyyy = bogota.getFullYear();
  const mm = String(bogota.getMonth() + 1).padStart(2, "0");
  const dd = String(bogota.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function renderEmail(weekId: string, posts: StoredPost[]): string {
  const cards = posts
    .map(
      (p, i) => `
      <div style="border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;margin-bottom:16px;">
        <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;">
          ${WEEK_FORMATS[i].day} · ${p.formatLabel}
        </div>
        <div style="font-size:13px;color:#64748b;margin-bottom:10px;">Tema: ${p.topic}</div>
        <pre style="white-space:pre-wrap;font-family:inherit;font-size:14px;background:#f7fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;margin:0 0 10px;">${p.caption}</pre>
        <div style="font-size:12.5px;color:#64748b;"><b>Producción:</b> ${p.productionNote}</div>
      </div>`
    )
    .join("");

  return `
    <p>Hola,</p>
    <p>Aquí están los 3 posts propuestos para la semana del <b>${weekId}</b>. Revísalos, ajusta lo que necesites, y prográmalos en el Planificador de Meta Business Suite cuando estén listos.</p>
    ${cards}
    <p style="color:#64748b;font-size:12.5px;">Generado automáticamente por el agente de contenido de My Home Doctor. No se publicó nada — esto es solo para tu revisión.</p>
  `;
}

async function runContentGeneration(): Promise<{ weekId: string; posts: StoredPost[] }> {
  const weekId = nextMondayId();
  const topics = await takeNextTopics(WEEK_FORMATS.length);
  const posts = await generateWeeklyPosts(topics);

  await savePlan(weekId, posts);
  await sendEmail(CONTENT_AGENT_EMAIL_TO, `Borradores de contenido — semana del ${weekId}`, renderEmail(weekId, posts));

  return { weekId, posts };
}

/** Cloud Function programada: cada domingo genera y envía los posts de la semana siguiente. */
export const generateWeeklyContentPlan = functions
  .region("us-central1")
  .runWith({ timeoutSeconds: 120 })
  .pubsub.schedule("0 18 * * 0") // domingo 18:00 Bogotá
  .timeZone("America/Bogota")
  .onRun(async () => {
    try {
      const { weekId } = await runContentGeneration();
      console.log(`[ContentAgent] Plan semanal generado y enviado: ${weekId}`);
    } catch (error) {
      console.error("[ContentAgent] Error generando plan semanal:", error);
    }
    return null;
  });

/** Disparador manual (protegido por secreto compartido) para generar un lote fuera del cron. */
export const generateContentPlanNow = functions
  .region("us-central1")
  .runWith({ timeoutSeconds: 120 })
  .https.onRequest(async (req, res) => {
    if (!CONTENT_AGENT_TRIGGER_SECRET || req.query.secret !== CONTENT_AGENT_TRIGGER_SECRET) {
      res.status(403).json({ error: "No autorizado" });
      return;
    }

    try {
      const { weekId } = await runContentGeneration();
      res.status(200).json({ success: true, weekId });
    } catch (error: any) {
      console.error("[ContentAgent] Error en disparo manual:", error);
      res.status(500).json({ error: error.message || "Error generando el plan de contenido" });
    }
  });
