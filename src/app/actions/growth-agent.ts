// ============================================================
// app/actions/growth-agent.ts — Server Action: Agente de Crecimiento
// Herramienta interna, solo visible/usable por el fundador.
// Redacta borradores de outreach, onboarding de embajadores y
// estrategia de marketing. Semi-automático: nunca envía nada,
// solo genera texto para revisión y copia manual.
// ============================================================
'use server';

import { getAdminDb } from '@/lib/firebase-admin';
import { COLECCION_GROWTH_DRAFTS } from '@/lib/constants';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyFounderAccess } from '@/lib/founder-access';

const ABACUS_API_URL = 'https://routellm.abacus.ai/v1/chat/completions';
const MODEL_ID = 'claude-3-5-sonnet-20241022';
const MAX_TOKENS = 1536;
const TEMPERATURE = 0.6;

export type GrowthMode = 'outreach' | 'ambassador' | 'marketing_strategy';

export interface GrowthDraftResult {
  success: boolean;
  draft?: string;
  draftId?: string;
  error?: string;
}

export interface GrowthDraftHistoryItem {
  id: string;
  mode: GrowthMode;
  inputContext: string;
  draftText: string;
  status: 'borrador' | 'usado';
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/*  Contexto de negocio ya definido (evita que el modelo alucine cifras) */
/* ------------------------------------------------------------------ */
const NEGOCIO_CONTEXTO = `
Datos del negocio (usar exactamente estas cifras y hechos, no inventar otros):
- Producto: myhomedoctorapp — asistente de orientación en salud familiar por IA (Dra. Hilda), PWA.
- Cumple Resolución 2654 de 2019 (teleorientación) y Ley 1581 de 2012 (datos sensibles) en Colombia.
- No diagnostica ni prescribe — orienta, educa y hace triage hacia el nivel de atención adecuado.
- Precio founder: 19.900 COP/mes, precio garantizado por 6-12 meses.
- Precio regular de referencia: 24.900 COP/mes (7 tokens diarios por 30 días).
- Canales principales del fundador: WhatsApp (contactos cálidos) e Instagram (crecimiento orgánico lento).
- Programa de embajadores: comisión sobre el primer mes de cada referido que se suscribe (modelo de pago por resultado, no adelantado).
`.trim();

const SYSTEM_PROMPTS: Record<GrowthMode, string> = {
  outreach: `Eres un copywriter experto en conversión para salud digital en Colombia. Tu tarea es redactar UN mensaje corto de WhatsApp (máximo 80 palabras, tono cercano y humano, nunca corporativo) para convertir un contacto cálido en usuario founder de myhomedoctorapp.

${NEGOCIO_CONTEXTO}

Reglas:
- Usa el contexto específico que te da el fundador sobre el contacto (quién es, relación, qué le importa).
- Incluye la oferta founder (19.900 COP/mes, precio garantizado) de forma natural, no como anuncio.
- Cierra con una pregunta o llamado a la acción simple (ej. "¿te la activo?").
- Menciona brevemente, sin sonar legal, que es orientación asistida por IA y no reemplaza consulta médica.
- No uses emojis en exceso (máximo 1-2). No uses mayúsculas sostenidas. No inventes cifras distintas a las dadas.
- Devuelve SOLO el mensaje listo para copiar y pegar, sin explicaciones ni encabezados.`,

  ambassador: `Eres un especialista en programas de referidos para startups de salud digital. Tu tarea es redactar contenido de onboarding o soporte para un embajador (amigo/colega) que ayuda a promover myhomedoctorapp.

${NEGOCIO_CONTEXTO}

Reglas:
- Usa el contexto que te da el fundador (qué necesita el embajador: explicación del programa, respuesta a una duda puntual, mensaje de agradecimiento, etc.).
- Sé claro sobre cómo funciona la comisión (pago por resultado, sobre el primer mes de cada referido pagante) y qué se espera de ellos (compartir el mensaje/oferta, no presionar a nadie).
- Tono cálido y de equipo, como si el fundador le escribiera directamente a un amigo que lo está ayudando.
- Devuelve SOLO el texto listo para copiar y pegar, sin explicaciones ni encabezados.`,

  marketing_strategy: `Eres un asesor de growth y marketing especializado en salud digital B2C en Latinoamérica, asesorando a un médico fundador solo (sin equipo) con recursos limitados.

${NEGOCIO_CONTEXTO}

Reglas:
- El fundador te va a dar una situación, objetivo o pregunta abierta.
- Responde con ideas concretas y accionables (no teoría genérica): copy de posicionamiento, estructura de campaña, ángulos de contenido para Instagram/WhatsApp, o pasos priorizados.
- Prioriza siempre tácticas de bajo costo/autofinanciadas antes que pauta paga, dado que el fundador tiene capital limitado.
- Usa formato de lista o pasos numerados cuando ayude a la claridad. Sé breve pero específico — nada de relleno.`,
};

/* ------------------------------------------------------------------ */
/*  Generar borrador                                                   */
/* ------------------------------------------------------------------ */
export async function generateGrowthDraft(
  mode: GrowthMode,
  context: string,
  idToken: string
): Promise<GrowthDraftResult> {
  const access = await verifyFounderAccess(idToken);
  if (!access.ok) {
    return { success: false, error: access.error };
  }

  if (!context.trim()) {
    return { success: false, error: 'Describe el contexto para generar el borrador.' };
  }

  const apiKey = process.env.ABACUS_API_KEY;
  if (!apiKey) {
    console.error('[GrowthAgent] ABACUS_API_KEY no configurada');
    return { success: false, error: 'Error de configuración del servidor. Contacta al administrador.' };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000);

    const response = await fetch(ABACUS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL_ID,
        messages: [
          { role: 'system', content: SYSTEM_PROMPTS[mode] },
          { role: 'user', content: context },
        ],
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Sin detalle');
      console.error(`[GrowthAgent] Error API ${response.status}: ${errorText}`);
      return { success: false, error: `Error del servicio de IA (${response.status}). Intenta de nuevo.` };
    }

    const data = await response.json();
    const draftText = data.choices?.[0]?.message?.content?.trim() ?? '';

    if (!draftText) {
      return { success: false, error: 'No se recibió respuesta del agente. Intenta de nuevo.' };
    }

    const draftDoc = {
      mode,
      inputContext: context,
      draftText,
      status: 'borrador' as const,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: access.uid,
    };

    const docRef = await getAdminDb().collection(COLECCION_GROWTH_DRAFTS).add(draftDoc);

    return { success: true, draft: draftText, draftId: docRef.id };
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return { success: false, error: 'La solicitud tardó demasiado. Intenta de nuevo.' };
    }
    console.error('[GrowthAgent] Error inesperado:', error);
    return { success: false, error: 'Ocurrió un error inesperado. Intenta de nuevo.' };
  }
}

/* ------------------------------------------------------------------ */
/*  Historial de borradores                                            */
/* ------------------------------------------------------------------ */
export async function getGrowthDraftHistory(idToken: string): Promise<GrowthDraftHistoryItem[]> {
  const access = await verifyFounderAccess(idToken);
  if (!access.ok) {
    return [];
  }

  const snap = await getAdminDb()
    .collection(COLECCION_GROWTH_DRAFTS)
    .orderBy('createdAt', 'desc')
    .limit(30)
    .get();

  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      mode: data.mode,
      inputContext: data.inputContext,
      draftText: data.draftText,
      status: data.status,
      createdAt: data.createdAt?.toDate?.().toISOString() ?? new Date().toISOString(),
    };
  });
}

/* ------------------------------------------------------------------ */
/*  Marcar borrador como usado                                         */
/* ------------------------------------------------------------------ */
export async function markGrowthDraftAsUsed(idToken: string, draftId: string): Promise<{ success: boolean; error?: string }> {
  const access = await verifyFounderAccess(idToken);
  if (!access.ok) {
    return { success: false, error: access.error };
  }

  try {
    await getAdminDb().collection(COLECCION_GROWTH_DRAFTS).doc(draftId).update({ status: 'usado' });
    return { success: true };
  } catch (error) {
    console.error('[GrowthAgent] Error marcando borrador como usado:', error);
    return { success: false, error: 'No se pudo actualizar el borrador.' };
  }
}
