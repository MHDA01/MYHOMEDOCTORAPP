"use strict";
/**
 * Llamada a Gemini por REST, igual que llamar_gemini() de protocolos/herramientas/comun.py:
 * misma forma del cuerpo, sin partes de razonamiento en el texto y con el uso medido.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.llamarGemini = llamarGemini;
async function llamarGemini(modelo, sistema, usuario, { temperatura = 0.2, maxTokens = 32768, jsonSalida = true, limiteMs }) {
    var _a, _b, _c, _d, _e;
    const clave = process.env.GEMINI_API_KEY;
    if (!clave)
        throw new Error("Falta GEMINI_API_KEY en el entorno de las funciones.");
    const generationConfig = { temperature: temperatura, maxOutputTokens: maxTokens };
    if (jsonSalida)
        generationConfig.responseMimeType = "application/json";
    const cuerpo = {
        systemInstruction: { parts: [{ text: sistema }] },
        contents: [{ role: "user", parts: [{ text: usuario }] }],
        generationConfig,
    };
    const inicio = Date.now();
    const respuesta = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": clave },
        body: JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(limiteMs),
    });
    if (!respuesta.ok) {
        const detalle = (await respuesta.text()).slice(0, 500);
        throw new Error(`Gemini HTTP ${respuesta.status}: ${detalle}`);
    }
    const datos = await respuesta.json();
    const candidato = (_a = datos === null || datos === void 0 ? void 0 : datos.candidates) === null || _a === void 0 ? void 0 : _a[0];
    if (!((_b = candidato === null || candidato === void 0 ? void 0 : candidato.content) === null || _b === void 0 ? void 0 : _b.parts)) {
        throw new Error(`Gemini no devolvió contenido (finishReason: ${(_c = candidato === null || candidato === void 0 ? void 0 : candidato.finishReason) !== null && _c !== void 0 ? _c : "desconocido"}).`);
    }
    const texto = candidato.content.parts.filter((p) => !p.thought).map((p) => { var _a; return (_a = p.text) !== null && _a !== void 0 ? _a : ""; }).join("");
    const uso = Object.assign(Object.assign({}, ((_d = datos.usageMetadata) !== null && _d !== void 0 ? _d : {})), { segundos: Math.round((Date.now() - inicio) / 100) / 10, finishReason: (_e = candidato.finishReason) !== null && _e !== void 0 ? _e : null, modelo });
    return { texto, uso };
}
//# sourceMappingURL=gemini.js.map