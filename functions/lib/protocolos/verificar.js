"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.juezGemini = exports.MODELO_JUEZ = void 0;
exports.verificar = verificar;
const gemini_1 = require("./gemini");
const redactar_1 = require("./redactar");
const texto_1 = require("./texto");
exports.MODELO_JUEZ = "gemini-3.5-flash";
const MIN_CITA = 15; // la cita ya debe salir de UNA recomendación concreta
// Los patrones de verificar.py. `\b`, `\d` y `\s` se traducen a su sentido en
// Python (Unicode), porque en JavaScript `\b` y `\d` solo conocen ASCII.
const PATRONES_MEDICAMENTO = [
    "\\b\\d+(?:[.,]\\d+)?\\s*(?:mg|ml|mcg|µg|ui|gotas|g)(?:/kg)?\\b",
    "\\bdosis\\b", "\\bmedicament", "\\bantibi[oó]tic", "\\bamoxicil", "\\bacetaminof",
    "\\bparacetam", "\\bibuprof", "\\bzinc\\b", "∫inc", "\\bondansetr", "\\bloperam",
    "\\bracecadotril", "\\bprobi[oó]tic", "\\bsuero\\b", "\\bsales de rehidrataci", "\\bsro\\b",
    "\\bjarabe\\b", "\\bvitamina", "\\bsuplement", "\\bnebuliz", "\\bsalbutamol", "\\bcorticoid",
].map((p) => new RegExp(p
    .replace(/\\b/g, "(?:(?<=[\\p{L}\\p{N}_])(?![\\p{L}\\p{N}_])|(?<![\\p{L}\\p{N}_])(?=[\\p{L}\\p{N}_]))")
    .replace(/\\d/g, "\\p{Nd}")
    .replace(/\\s/g, "[\\t\\n\\v\\f\\r \\x1c-\\x1f\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]"), "iu"));
/** Texto de la guía con sus normalizaciones guardadas (se consultan cientos de veces). */
class TextoGuia {
    constructor(paginas) {
        this.paginas = paginas;
        this.pares = new Map();
        this.norm = paginas.map(texto_1.normalizar);
        this.sin = paginas.map(texto_1.sinEspacios);
    }
    par(i) {
        let p = this.pares.get(i);
        if (!p) {
            const t = this.paginas[i] + "\n" + this.paginas[i + 1];
            p = { n: (0, texto_1.normalizar)(t), s: (0, texto_1.sinEspacios)(t) };
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
function ubicarCita(guia, cita, pagina) {
    const n = guia.paginas.length;
    const objetivo = (0, texto_1.normalizar)(cita);
    const objetivoSin = (0, texto_1.sinEspacios)(cita);
    const orden = [pagina - 1];
    for (let i = 0; i < n; i++)
        if (i !== pagina - 1)
            orden.push(i);
    for (const i of orden) {
        if (i >= 0 && i < n && (guia.norm[i].includes(objetivo) || guia.sin[i].includes(objetivoSin)))
            return i + 1;
    }
    for (const i of orden) {
        if (i >= 0 && i < n - 1) {
            const p = guia.par(i);
            if (p.n.includes(objetivo) || p.s.includes(objetivoSin))
                return i + 1;
        }
    }
    return null;
}
function alertasMedicamento(...textos) {
    const encontrados = new Set();
    for (const t of textos) {
        for (const p of PATRONES_MEDICAMENTO) {
            const m = (t || "").match(p);
            if (m)
                encontrados.add((0, texto_1.recortar)(m[0]));
        }
    }
    return [...encontrados].sort();
}
const juezGemini = (limiteMs) => async (items, motivo) => {
    var _a, _b, _c, _d;
    const sistema = "Eres un revisor clínico estricto. Para cada ítem decide si el TEXTO dice algo que la CITA no sostiene: " +
        "una afirmación extra, una generalización, una condición omitida (p. ej. 'sin deshidratación'), un cambio " +
        "de conjunción ('y' por 'o'), una cifra o límite de edad distinto, o una instrucción que la cita no da. " +
        "Si el ítem trae una ADAPTACIÓN declarada (p. ej. un criterio de hospitalización presentado como signo para " +
        "ir a urgencias), esa adaptación concreta ya está a la vista del médico: no la marques, pero sí cualquier " +
        "otra diferencia. " +
        `CONTEXTO: todas las frases forman parte de un protocolo sobre ${motivo.motivo.toLowerCase()} en ` +
        `${motivo.edad}; no marques como problema que la frase no repita esa población. ` +
        "No uses conocimiento propio: juzga solo contra la cita. " +
        'Responde JSON: {"items": [{"id": "...", "fiel": true|false, "problema": "texto breve o null"}]}';
    const pares = items.map((it) => {
        var _a;
        return ({
            id: it.id, texto: it.texto, cita: it.cita_literal, adaptacion: (_a = it.adaptacion) !== null && _a !== void 0 ? _a : null,
        });
    });
    // Frases trampa: una fiel y una que cambia "y" por "o" (error real del primer piloto).
    // Si el juez no marca la mala, su revisión de esta corrida no es confiable.
    pares.push({
        id: "canario-fiel", texto: "Lávese las manos con agua y jabón antes de preparar los alimentos del niño.",
        cita: "Se recomienda el lavado de manos con agua y jabón antes de preparar los alimentos del niño.", adaptacion: null,
    }, {
        id: "canario-infiel", texto: "Acuda si tiene 10 o más deposiciones en 24 horas o 5 o más vómitos en 4 horas.",
        cita: "factores de riesgo para muerte (diez o más deposiciones diarreicas en las últimas 24 horas y cinco o más vómitos en las últimas 4 horas)",
        adaptacion: null,
    });
    const { texto, uso } = await (0, gemini_1.llamarGemini)(exports.MODELO_JUEZ, sistema, JSON.stringify(pares), { temperatura: 0.0, limiteMs });
    const veredictos = new Map();
    for (const r of ((_b = (_a = JSON.parse(texto)) === null || _a === void 0 ? void 0 : _a.items) !== null && _b !== void 0 ? _b : [])) {
        if (r && typeof r.id === "string")
            veredictos.set(r.id, r);
    }
    return {
        veredictos,
        uso: Object.assign(Object.assign({}, uso), { juez_confiable: ((_c = veredictos.get("canario-infiel")) === null || _c === void 0 ? void 0 : _c.fiel) === false && ((_d = veredictos.get("canario-fiel")) === null || _d === void 0 ? void 0 : _d.fiel) === true }),
    };
};
exports.juezGemini = juezGemini;
async function verificar(entrada, biblioteca, juez) {
    var _a, _b, _c;
    const { motivo } = entrada;
    const borrador = JSON.parse(entrada.respuesta);
    const recs = new Map();
    for (const f of motivo.fuentes)
        for (const r of await biblioteca.inventario(f))
            recs.set(r.rec_id, r);
    const guias = new Map();
    const guia = async (fuente) => {
        let g = guias.get(fuente);
        if (!g) {
            g = new TextoGuia(await biblioteca.paginas(fuente));
            guias.set(fuente, g);
        }
        return g;
    };
    const items = [];
    const excluidas = [];
    const invalidas = [];
    const vistas = new Set();
    for (const d of (Array.isArray(borrador === null || borrador === void 0 ? void 0 : borrador.decisiones) ? borrador.decisiones : [])) {
        const recId = d === null || d === void 0 ? void 0 : d.rec_id;
        if (typeof recId !== "string" || !recs.has(recId) || vistas.has(recId)) {
            invalidas.push({ rec_id: recId !== null && recId !== void 0 ? recId : null, problema: typeof recId === "string" && recs.has(recId) ? "decisión repetida" : "no existe en el inventario" });
            continue;
        }
        vistas.add(recId);
        const rec = recs.get(recId);
        const fuente = recId.split("#")[0];
        if (!d.incluir) {
            const razon = redactar_1.RAZONES_EXCLUSION.includes(d.razon) ? d.razon : `razón no válida: ${(_a = d.razon) !== null && _a !== void 0 ? _a : "None"}`;
            excluidas.push(Object.assign(Object.assign({}, rec), { razon }));
            continue;
        }
        for (const bruto of (Array.isArray(d.items) ? d.items : [])) {
            if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) {
                invalidas.push({ rec_id: recId, problema: "ítem mal formado" });
                continue;
            }
            const razones = [];
            const alertas = [];
            let citasBrutas = [];
            if (Array.isArray(bruto.citas_literales) && bruto.citas_literales.length)
                citasBrutas = bruto.citas_literales;
            else if (bruto.cita_literal)
                citasBrutas = [bruto.cita_literal];
            const citas = citasBrutas.map((c, n) => {
                if (typeof c === "string")
                    return c;
                razones.push(`fragmento ${n + 1} no es texto`);
                return JSON.stringify(c);
            });
            const it = Object.assign(Object.assign({}, bruto), { id: `i${items.length + 1}`, rec_id: recId, fuente, calificacion_literal: rec.calificacion, calificacion_verificada: true, citas_literales: citas, cita_literal: citas.join(" … ") });
            if (!(typeof it.seccion === "string" && Object.prototype.hasOwnProperty.call(redactar_1.SECCIONES, it.seccion)))
                razones.push(`sección no válida: ${(_b = it.seccion) !== null && _b !== void 0 ? _b : "None"}`);
            if (!citas.length)
                razones.push("sin cita");
            for (let n = 1; n <= citas.length; n++) {
                const cita = citas[n - 1];
                if (typeof citasBrutas[n - 1] !== "string")
                    continue;
                if ((0, texto_1.largo)((0, texto_1.normalizar)(cita)) < MIN_CITA) {
                    razones.push(`fragmento ${n} demasiado corto para verificarlo`);
                }
                else if (!((0, texto_1.normalizar)(rec.texto).includes((0, texto_1.normalizar)(cita)) || (0, texto_1.sinEspacios)(rec.texto).includes((0, texto_1.sinEspacios)(cita)))) {
                    razones.push(`el fragmento ${n} no es literal de la recomendación que dice usar`);
                }
                else {
                    const pagina = ubicarCita(await guia(fuente), cita, rec.pagina);
                    if (pagina === null)
                        razones.push(`el fragmento ${n} no existe literalmente en el PDF`);
                    else if (n === 1)
                        it.pagina = pagina;
                }
            }
            if (it.adaptacion)
                alertas.push("adaptación declarada: " + it.adaptacion);
            const meds = alertasMedicamento(typeof it.texto === "string" ? it.texto : "", it.cita_literal);
            if (meds.length)
                alertas.push("menciona medicamento, producto o dosis: " + meds.join(", "));
            if (meds.length || it.requiere_decision_medica)
                it.requiere_decision_medica = true;
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
            if (a === b || a.rec_id !== b.rec_id)
                continue;
            const textoRec = (0, texto_1.normalizar)(recs.get(a.rec_id).texto);
            for (const ca of a.citas_literales) {
                for (const cb of b.citas_literales) {
                    if (textoRec.includes(`${(0, texto_1.normalizar)(ca)} y ${(0, texto_1.normalizar)(cb)}`)) {
                        for (const [it, otro] of [[a, b], [b, a]]) {
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
    const partesNoUsadas = [];
    for (const rid of new Set(items.map((i) => i.rec_id))) {
        const usadas = items
            .filter((i) => i.rec_id === rid && i.verificacion.estado === "verificado")
            .flatMap((i) => i.citas_literales.map(texto_1.sinEspacios));
        const continuo = (0, texto_1.colapsarEspacios)(recs.get(rid).texto); // los saltos de línea del PDF no son frases
        const segmentos = continuo.split(texto_1.FIN_DE_ORACION).map(texto_1.recortar).filter((s) => (0, texto_1.largo)(s) >= 30);
        const cubierto = (seg) => {
            // Ventanas de 30 caracteres cada 10; cuenta como usado si al menos el 40 % aparece en alguna cita.
            const s = Array.from((0, texto_1.sinEspacios)(seg));
            const ventanas = [];
            for (let k = 0; k < Math.max(1, s.length - 29); k += 10)
                ventanas.push(s.slice(k, k + 30).join(""));
            return ventanas.filter((v) => usadas.some((u) => u.includes(v))).length >= ventanas.length * 0.4;
        };
        const faltan = segmentos.filter((seg) => !cubierto(seg));
        if (faltan.length) {
            const r = recs.get(rid);
            partesNoUsadas.push({ rec_id: rid, pagina: r.pagina, calificacion: r.calificacion, segmentos: faltan });
        }
    }
    const verificados = items.filter((i) => i.verificacion.estado === "verificado");
    let usoJuez = null;
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
    const razonesExclusion = {};
    for (const e of excluidas)
        razonesExclusion[e.razon] = ((_c = razonesExclusion[e.razon]) !== null && _c !== void 0 ? _c : 0) + 1;
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
        vacios: Array.isArray(borrador === null || borrador === void 0 ? void 0 : borrador.vacios) ? borrador.vacios.filter((v) => typeof v === "string") : [],
        items,
        excluidas,
        sin_decision: sinDecision,
        partes_no_usadas: partesNoUsadas.sort((a, b) => a.pagina - b.pagina),
        decisiones_invalidas: invalidas,
    };
}
//# sourceMappingURL=verificar.js.map