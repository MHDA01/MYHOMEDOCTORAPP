/**
 * @fileoverview Verificación de la firma de Meta en los webhooks de WhatsApp e
 * Instagram. Sin dependencias de Firebase, para poder probarla.
 *
 * Meta firma cada POST con HMAC-SHA256 del cuerpo **crudo**, usando el App
 * Secret de la aplicación, y lo manda en la cabecera `X-Hub-Signature-256`
 * como `sha256=<hex>`.
 *
 * Sin esto, cualquiera que conozca la URL del webhook puede hacerse pasar por
 * Meta: inventarse un mensaje entrante, hacer que el agente de ventas conteste
 * (cada respuesta es una llamada al modelo, que se paga) y conseguir que la
 * app le mande mensajes de WhatsApp a un número cualquiera.
 *
 * Falla cerrado: si falta el App Secret, no se acepta nada. Es preferible
 * quedarse sin recibir mensajes a aceptar mensajes forjados.
 */
import * as crypto from "crypto";

/** El cuerpo tal como llegó. Firebase lo deja en `req.rawBody`. */
export type CuerpoCrudo = Buffer | string | undefined | null;

export function firmaMetaValida(
  cuerpo: CuerpoCrudo,
  cabecera: unknown,
  appSecret: string | undefined
): boolean {
  if (!appSecret) return false;
  if (typeof cabecera !== "string" || !cabecera.startsWith("sha256=")) return false;
  if (cuerpo === undefined || cuerpo === null) return false;

  const recibida = cabecera.slice("sha256=".length).trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(recibida)) return false;

  const calculada = crypto
    .createHmac("sha256", appSecret)
    .update(typeof cuerpo === "string" ? Buffer.from(cuerpo, "utf8") : cuerpo)
    .digest("hex");

  // Comparación de tiempo constante: una comparación normal filtra, por el
  // tiempo que tarda, cuántos caracteres del principio acertó quien prueba.
  return crypto.timingSafeEqual(Buffer.from(calculada, "hex"), Buffer.from(recibida, "hex"));
}
