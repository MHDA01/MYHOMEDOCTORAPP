/**
 * Normalización de texto para comparar citas con la guía.
 *
 * Es una traducción exacta de protocolos/herramientas/comun.py (normalizar y
 * sin_espacios), que es donde se midió el piloto. Si cambias algo aquí, cámbialo
 * allá y vuelve a correr la prueba de paridad: una diferencia mínima haría que
 * una cita verdadera se rechace o que una falsa pase.
 */

// Los mismos caracteres que `\s` de Python para texto Unicode. El `\s` de
// JavaScript no incluye \x1c-\x1f ni \x85, e incluye ﻿.
const ESPACIO = "[\\t\\n\\v\\f\\r \\x1c-\\x1f\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]";

const CORTE_DE_LINEA = new RegExp(`-${ESPACIO}*\\n${ESPACIO}*`, "g");
const ESPACIOS = new RegExp(`${ESPACIO}+`, "g");
const BORDES = new RegExp(`^${ESPACIO}+|${ESPACIO}+$`, "g");

/** Separador de oraciones usado para buscar partes no usadas de una recomendación. */
export const FIN_DE_ORACION = new RegExp(`(?<=[.:;])${ESPACIO}+`);

// Rarezas de extracción observadas en estas guías (glifos y ligaduras).
const SUSTITUCIONES: Array<[string, string]> = [
  ["∫", "z"], // ∫ en lugar de z
  ["­", ""], // guion suave
  ["’", "'"],
  ["“", '"'],
  ["”", '"'],
];

// `casefold()` de Python coincide con `toLowerCase()` salvo en unos pocos
// caracteres; estos son los que pueden aparecer en textos en español o latín.
const CASEFOLD_EXTRA: Record<string, string> = { "ß": "ss", "ẞ": "ss", "ſ": "s", "ς": "σ" };

function casefold(texto: string): string {
  let salida = "";
  for (const c of texto) salida += CASEFOLD_EXTRA[c] ?? c.toLowerCase();
  return salida;
}

export function colapsarEspacios(texto: string, reemplazo = " "): string {
  return texto.replace(ESPACIOS, reemplazo);
}

export function normalizar(texto: string): string {
  let t = texto.normalize("NFKC");
  for (const [a, b] of SUSTITUCIONES) t = t.split(a).join(b);
  t = t.replace(CORTE_DE_LINEA, ""); // palabra partida al final de línea
  t = t.replace(ESPACIOS, " ");
  return casefold(t.replace(BORDES, ""));
}

export function sinEspacios(texto: string): string {
  return normalizar(texto).replace(ESPACIOS, "");
}

export function recortar(texto: string): string {
  return texto.replace(BORDES, "");
}

/** Longitud en caracteres (puntos de código), como `len()` de Python. */
export function largo(texto: string): number {
  return Array.from(texto).length;
}
