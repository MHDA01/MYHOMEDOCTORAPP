import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

/**
 * Utilidad de cifrado para datos sensibles (PHI).
 * Implementa AES-256-GCM.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

// Se debe configurar MHDA_ENCRYPTION_KEY en el entorno (32 bytes en base64 o 32 chars)
const ENCRYPTION_KEY = process.env.MHDA_ENCRYPTION_KEY;

if (!ENCRYPTION_KEY) {
  console.warn('⚠️ MHDA_ENCRYPTION_KEY no está configurada. El cifrado fallará.');
}

/**
 * Cifra un valor de texto.
 * Retorna el resultado en formato: iv:authTag:encryptedContent (todo en hex o base64)
 */
export function encryptField(value: string): string {
  if (!value) return value;
  if (!ENCRYPTION_KEY) throw new Error('Encryption key missing');

  const iv = randomBytes(IV_LENGTH);
  const key = Buffer.from(ENCRYPTION_KEY, 'base64');
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(value, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag().toString('base64');

  // Formato: iv.authTag.encrypted
  return `${iv.toString('base64')}.${authTag}.${encrypted}`;
}

/**
 * Descifra un valor de texto.
 */
export function decryptField(encrypted: string): string {
  if (!encrypted || !encrypted.includes('.')) return encrypted;
  if (!ENCRYPTION_KEY) throw new Error('Encryption key missing');

  try {
    const [ivBase64, authTagBase64, encryptedBase64] = encrypted.split('.');
    
    const key = Buffer.from(ENCRYPTION_KEY, 'base64');
    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');
    
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedBase64, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('[Crypto] Error al descifrar campo:', error);
    // Si falla el descifrado, devolvemos el original por si acaso no estaba cifrado 
    // (estrategia de migración progresiva), o lanzamos error en producción.
    return encrypted;
  }
}
