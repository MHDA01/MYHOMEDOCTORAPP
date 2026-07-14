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

function getEncryptionKeyBuffer(): Buffer {
  if (!ENCRYPTION_KEY) throw new Error('Encryption key missing');

  const normalizedKey = ENCRYPTION_KEY.trim();
  const base64Key = Buffer.from(normalizedKey, 'base64');

  if (base64Key.length === 32) {
    return base64Key;
  }

  const utf8Key = Buffer.from(normalizedKey, 'utf8');
  if (utf8Key.length === 32) {
    return utf8Key;
  }

  return scryptSync(normalizedKey, 'mhda-encryption-salt', 32);
}

/**
 * Cifra un valor de texto.
 * Retorna el resultado en formato: iv:authTag:encryptedContent (todo en hex o base64)
 */
export function encryptField(value: string): string {
  if (!value) return value;
  if (!ENCRYPTION_KEY) throw new Error('Encryption key missing');

  const iv = randomBytes(IV_LENGTH);
  const key = getEncryptionKeyBuffer();
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(value, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag().toString('base64');

  // Formato: iv.authTag.encrypted
  return `${iv.toString('base64')}.${authTag}.${encrypted}`;
}

/**
 * Descifra un valor de texto.
 * @throws Error si el descifrado falla en producción
 */
export function decryptField(encrypted: string): string {
  if (!encrypted || !encrypted.includes('.')) return encrypted;
  if (!ENCRYPTION_KEY) throw new Error('Encryption key missing');

  try {
    const [ivBase64, authTagBase64, encryptedBase64] = encrypted.split('.');
    
    const key = getEncryptionKeyBuffer();
    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');
    
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedBase64, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[Crypto] Error al descifrar campo:', errorMsg);
    
    // En desarrollo, retornar el valor original para debugging
    // En producción, lanzar error explícitamente para detectar problemas
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Crypto] Development mode: retornando valor encriptado original');
      return encrypted;
    }
    
    // En producción, lanzar error para garantizar data integrity
    throw new Error(
      `Failed to decrypt sensitive data: ${errorMsg}. ` +
      'This indicates a data corruption or key mismatch. ' +
      'Please contact support and do not continue using this data.'
    );
  }
}
