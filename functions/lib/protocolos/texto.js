"use strict";
/**
 * Normalización de texto para comparar citas con la guía.
 *
 * Es una traducción exacta de protocolos/herramientas/comun.py (normalizar y
 * sin_espacios), que es donde se midió el piloto. Si cambias algo aquí, cámbialo
 * allá y vuelve a correr la prueba de paridad: una diferencia mínima haría que
 * una cita verdadera se rechace o que una falsa pase.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FIN_DE_ORACION = void 0;
exports.colapsarEspacios = colapsarEspacios;
exports.normalizar = normalizar;
exports.sinEspacios = sinEspacios;
exports.recortar = recortar;
exports.largo = largo;
// Los mismos caracteres que `\s` de Python para texto Unicode. El `\s` de
// JavaScript no incluye \x1c-\x1f ni \x85, e incluye ﻿.
const ESPACIO = "[\\t\\n\\v\\f\\r \\x1c-\\x1f\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]";
const CORTE_DE_LINEA = new RegExp(`-${ESPACIO}*\\n${ESPACIO}*`, "g");
const ESPACIOS = new RegExp(`${ESPACIO}+`, "g");
const BORDES = new RegExp(`^${ESPACIO}+|${ESPACIO}+$`, "g");
/** Separador de oraciones usado para buscar partes no usadas de una recomendación. */
exports.FIN_DE_ORACION = new RegExp(`(?<=[.:;])${ESPACIO}+`);
// Rarezas de extracción observadas en estas guías (glifos y ligaduras).
const SUSTITUCIONES = [
    ["∫", "z"], // ∫ en lugar de z
    ["­", ""], // guion suave
    ["’", "'"],
    ["“", '"'],
    ["”", '"'],
];
// `casefold()` de Python coincide con `toLowerCase()` salvo en unos pocos
// caracteres; estos son los que pueden aparecer en textos en español o latín.
const CASEFOLD_EXTRA = { "ß": "ss", "ẞ": "ss", "ſ": "s", "ς": "σ" };
function casefold(texto) {
    var _a;
    let salida = "";
    for (const c of texto)
        salida += (_a = CASEFOLD_EXTRA[c]) !== null && _a !== void 0 ? _a : c.toLowerCase();
    return salida;
}
function colapsarEspacios(texto, reemplazo = " ") {
    return texto.replace(ESPACIOS, reemplazo);
}
function normalizar(texto) {
    let t = texto.normalize("NFKC");
    for (const [a, b] of SUSTITUCIONES)
        t = t.split(a).join(b);
    t = t.replace(CORTE_DE_LINEA, ""); // palabra partida al final de línea
    t = t.replace(ESPACIOS, " ");
    return casefold(t.replace(BORDES, ""));
}
function sinEspacios(texto) {
    return normalizar(texto).replace(ESPACIOS, "");
}
function recortar(texto) {
    return texto.replace(BORDES, "");
}
/** Longitud en caracteres (puntos de código), como `len()` de Python. */
function largo(texto) {
    return Array.from(texto).length;
}
//# sourceMappingURL=texto.js.map