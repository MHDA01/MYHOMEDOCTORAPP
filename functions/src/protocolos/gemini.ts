/**
 * Llamada a Gemini por REST, igual que llamar_gemini() de protocolos/herramientas/comun.py:
 * misma forma del cuerpo, sin partes de razonamiento en el texto y con el uso medido.
 */

export interface UsoGemini {
  [clave: string]: unknown;
  segundos: number;
  finishReason: string | null;
  modelo: string;
}

interface OpcionesGemini {
  temperatura?: number;
  maxTokens?: number;
  jsonSalida?: boolean;
  /** Tope de espera en milisegundos; debe ser menor que el timeout de la función. */
  limiteMs: number;
}

export async function llamarGemini(
  modelo: string,
  sistema: string,
  usuario: string,
  { temperatura = 0.2, maxTokens = 32768, jsonSalida = true, limiteMs }: OpcionesGemini
): Promise<{ texto: string; uso: UsoGemini }> {
  const clave = process.env.GEMINI_API_KEY;
  if (!clave) throw new Error("Falta GEMINI_API_KEY en el entorno de las funciones.");

  const generationConfig: Record<string, unknown> = { temperature: temperatura, maxOutputTokens: maxTokens };
  if (jsonSalida) generationConfig.responseMimeType = "application/json";
  const cuerpo = {
    systemInstruction: { parts: [{ text: sistema }] },
    contents: [{ role: "user", parts: [{ text: usuario }] }],
    generationConfig,
  };

  const inicio = Date.now();
  const respuesta = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": clave },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(limiteMs),
    }
  );
  if (!respuesta.ok) {
    const detalle = (await respuesta.text()).slice(0, 500);
    throw new Error(`Gemini HTTP ${respuesta.status}: ${detalle}`);
  }
  const datos: any = await respuesta.json();
  const candidato = datos?.candidates?.[0];
  if (!candidato?.content?.parts) {
    throw new Error(`Gemini no devolvió contenido (finishReason: ${candidato?.finishReason ?? "desconocido"}).`);
  }
  const texto = candidato.content.parts.filter((p: any) => !p.thought).map((p: any) => p.text ?? "").join("");
  const uso: UsoGemini = {
    ...(datos.usageMetadata ?? {}),
    segundos: Math.round((Date.now() - inicio) / 100) / 10,
    finishReason: candidato.finishReason ?? null,
    modelo,
  };
  return { texto, uso };
}
