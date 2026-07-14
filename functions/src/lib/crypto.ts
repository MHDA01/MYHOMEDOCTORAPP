import { createDecipheriv, scryptSync } from "crypto";

/**
 * Copia mínima (solo descifrado) de src/lib/crypto.ts para uso en Cloud Functions.
 * Debe usar el mismo MHDA_ENCRYPTION_KEY que el runtime de Next.js (ver functions/.env).
 */

const ALGORITHM = "aes-256-gcm";

function getEncryptionKeyBuffer(): Buffer {
  const encryptionKey = process.env.MHDA_ENCRYPTION_KEY;
  if (!encryptionKey) throw new Error("MHDA_ENCRYPTION_KEY missing");

  const normalizedKey = encryptionKey.trim();
  const base64Key = Buffer.from(normalizedKey, "base64");

  if (base64Key.length === 32) {
    return base64Key;
  }

  const utf8Key = Buffer.from(normalizedKey, "utf8");
  if (utf8Key.length === 32) {
    return utf8Key;
  }

  return scryptSync(normalizedKey, "mhda-encryption-salt", 32);
}

/**
 * Descifra un valor con formato iv.authTag.encrypted (mismo formato que encryptField).
 * Si el valor no está cifrado (no contiene ".") lo retorna tal cual.
 */
export function decryptField(encrypted: string): string {
  if (!encrypted || !encrypted.includes(".")) return encrypted;

  try {
    const [ivBase64, authTagBase64, encryptedBase64] = encrypted.split(".");

    const key = getEncryptionKeyBuffer();
    const iv = Buffer.from(ivBase64, "base64");
    const authTag = Buffer.from(authTagBase64, "base64");

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedBase64, "base64", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    console.error("[Crypto] Error al descifrar campo:", error);
    return "";
  }
}
