"use strict";
/**
 * @fileoverview Cliente compartido para la API de Gemini (Google Generative
 * Language). Sustituye al antiguo proxy RouteLLM de Abacus AI, que dejó de
 * responder con HTTP 402 ("A valid payment method is required") al caducar su
 * suscripción y tumbó con ella la generación de contenido y los consejos diarios.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.callGeminiText = callGeminiText;
exports.callGeminiJson = callGeminiJson;
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL_ID = "gemini-3.5-flash";
const REQUEST_TIMEOUT_MS = 30000;
function resolveApiKey() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY no configurada en el entorno de funciones.");
    }
    return apiKey;
}
async function callGemini(system, userMessage, options, responseMimeType) {
    var _a, _b, _c, _d, _e;
    const apiKey = resolveApiKey();
    const model = options.model || DEFAULT_MODEL_ID;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const post = (withThinking) => {
            var _a, _b, _c;
            const generationConfig = {
                temperature: (_a = options.temperature) !== null && _a !== void 0 ? _a : 0.7,
                maxOutputTokens: (_b = options.maxTokens) !== null && _b !== void 0 ? _b : 1000,
            };
            if (withThinking) {
                generationConfig.thinkingConfig = { thinkingBudget: (_c = options.thinkingBudget) !== null && _c !== void 0 ? _c : 0 };
            }
            if (responseMimeType) {
                generationConfig.responseMimeType = responseMimeType;
            }
            return fetch(`${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: system }] },
                    contents: [{ role: "user", parts: [{ text: userMessage }] }],
                    generationConfig,
                }),
                signal: controller.signal,
            });
        };
        // No todos los modelos aceptan thinkingBudget: gemini-3.6-flash y las
        // variantes -lite devuelven 400 si se les manda. Si eso pasa, se reintenta
        // sin el parámetro (esos modelos no razonan por defecto, así que el
        // presupuesto de salida se respeta igual).
        let response = await post(true);
        if (response.status === 400) {
            response = await post(false);
        }
        if (!response.ok) {
            throw new Error(`Gemini API error ${response.status}: ${await response.text()}`);
        }
        const data = (await response.json());
        const blockReason = (_a = data.promptFeedback) === null || _a === void 0 ? void 0 : _a.blockReason;
        if (blockReason) {
            throw new Error(`Gemini bloqueó la petición por seguridad: ${blockReason}`);
        }
        const content = ((_e = (_d = (_c = (_b = data.candidates) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.content) === null || _d === void 0 ? void 0 : _d.parts) !== null && _e !== void 0 ? _e : [])
            .map((part) => { var _a; return (_a = part === null || part === void 0 ? void 0 : part.text) !== null && _a !== void 0 ? _a : ""; })
            .join("")
            .trim();
        if (!content) {
            throw new Error(`Respuesta vacía de Gemini: ${JSON.stringify(data).slice(0, 500)}`);
        }
        return content;
    }
    finally {
        clearTimeout(timeoutId);
    }
}
async function callGeminiText(system, userMessage, options = {}) {
    return callGemini(system, userMessage, options);
}
/**
 * Igual que callGeminiText, pero pide y parsea JSON. Se le pasa a Gemini
 * responseMimeType "application/json", que garantiza sintaxis válida; la limpieza
 * de bloques ``` se conserva como red de seguridad por si el modelo los agrega.
 */
async function callGeminiJson(system, userMessage, options = {}) {
    const raw = await callGemini(system, userMessage, options, "application/json");
    const jsonText = raw
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```$/i, "")
        .trim();
    try {
        return JSON.parse(jsonText);
    }
    catch (e) {
        throw new Error(`Gemini no devolvió JSON válido: ${jsonText.slice(0, 500)}`);
    }
}
//# sourceMappingURL=gemini-client.js.map