/**
 * Test suite para crypto.ts
 * Cubre encriptación, descifrado, y manejo de errores
 */

import { encryptField, decryptField } from './crypto';

describe('Crypto Functions', () => {
  const testValue = 'Test allergies: Penicillin, Ibuprofen';
  let encryptedValue: string;

  beforeAll(() => {
    // Validar que MHDA_ENCRYPTION_KEY está configurada
    if (!process.env.MHDA_ENCRYPTION_KEY) {
      throw new Error('MHDA_ENCRYPTION_KEY environment variable is required for tests');
    }
  });

  describe('encryptField()', () => {
    it('should encrypt a string and return format: iv.authTag.encrypted', () => {
      encryptedValue = encryptField(testValue);
      
      expect(encryptedValue).toBeDefined();
      expect(encryptedValue).toContain('.');
      
      const [iv, authTag, encrypted] = encryptedValue.split('.');
      expect(iv).toBeDefined();
      expect(authTag).toBeDefined();
      expect(encrypted).toBeDefined();
    });

    it('should return empty string unchanged', () => {
      expect(encryptField('')).toBe('');
    });

    it('should throw error if MHDA_ENCRYPTION_KEY is missing', () => {
      const originalKey = process.env.MHDA_ENCRYPTION_KEY;
      delete process.env.MHDA_ENCRYPTION_KEY;

      expect(() => encryptField(testValue)).toThrow('Encryption key missing');

      process.env.MHDA_ENCRYPTION_KEY = originalKey;
    });
  });

  describe('decryptField()', () => {
    beforeAll(() => {
      encryptedValue = encryptField(testValue);
    });

    it('should decrypt encrypted data back to original value', () => {
      const decrypted = decryptField(encryptedValue);
      expect(decrypted).toBe(testValue);
    });

    it('should return unencrypted data unchanged (no dot separator)', () => {
      const plainText = 'plain text without encryption';
      expect(decryptField(plainText)).toBe(plainText);
    });

    it('should return empty string unchanged', () => {
      expect(decryptField('')).toBe('');
    });

    it('should throw error on corrupted encrypted data in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      // Modify encrypted data to corrupt authTag
      const [iv, , encrypted] = encryptedValue.split('.');
      const corruptedData = `${iv}.CORRUPTED_TAG.${encrypted}`;

      expect(() => decryptField(corruptedData)).toThrow(/Failed to decrypt sensitive data/);

      process.env.NODE_ENV = originalEnv;
    });

    it('should return encrypted data in development mode on corruption', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const [iv, , encrypted] = encryptedValue.split('.');
      const corruptedData = `${iv}.CORRUPTED_TAG.${encrypted}`;

      const result = decryptField(corruptedData);
      expect(result).toBe(corruptedData);

      process.env.NODE_ENV = originalEnv;
    });

    it('should throw error if MHDA_ENCRYPTION_KEY is missing', () => {
      const originalKey = process.env.MHDA_ENCRYPTION_KEY;
      delete process.env.MHDA_ENCRYPTION_KEY;

      expect(() => decryptField(encryptedValue)).toThrow('Encryption key missing');

      process.env.MHDA_ENCRYPTION_KEY = originalKey;
    });

    it('should throw error on wrong encryption key in production', () => {
      const originalEnv = process.env.NODE_ENV;
      const originalKey = process.env.MHDA_ENCRYPTION_KEY;

      process.env.NODE_ENV = 'production';
      // Simulate wrong key by modifying it
      process.env.MHDA_ENCRYPTION_KEY = Buffer.alloc(32).toString('base64'); // Wrong key

      expect(() => decryptField(encryptedValue)).toThrow(/Failed to decrypt sensitive data/);

      process.env.NODE_ENV = originalEnv;
      process.env.MHDA_ENCRYPTION_KEY = originalKey;
    });
  });

  describe('Round-trip encryption/decryption', () => {
    const testCases = [
      'Simple string',
      'JSON array: ["item1","item2"]',
      'Special chars: é, ñ, ü, @, #, $, %',
      'Medical data: Diabetes tipo 2, Hipertensión',
      'Very long string: ' + 'a'.repeat(1000),
    ];

    testCases.forEach((testCase) => {
      it(`should encrypt and decrypt: "${testCase.substring(0, 50)}..."`, () => {
        const encrypted = encryptField(testCase);
        const decrypted = decryptField(encrypted);
        expect(decrypted).toBe(testCase);
      });
    });
  });

  describe('Data Integrity', () => {
    it('should produce different ciphertext for same plaintext (due to random IV)', () => {
      const encrypted1 = encryptField(testValue);
      const encrypted2 = encryptField(testValue);
      
      // Ciphertexts should be different due to random IV
      expect(encrypted1).not.toBe(encrypted2);
      
      // But both should decrypt to same value
      expect(decryptField(encrypted1)).toBe(testValue);
      expect(decryptField(encrypted2)).toBe(testValue);
    });

    it('should detect tampering with encrypted content', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const encrypted = encryptField(testValue);
      const [iv, authTag, encryptedContent] = encrypted.split('.');
      
      // Tamper with encrypted content
      const tamperedContent = encryptedContent.substring(0, encryptedContent.length - 5) + 'XXXXX';
      const tamperedData = `${iv}.${authTag}.${tamperedContent}`;

      expect(() => decryptField(tamperedData)).toThrow(/Failed to decrypt sensitive data/);

      process.env.NODE_ENV = originalEnv;
    });

    it('should detect tampering with authTag', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const encrypted = encryptField(testValue);
      const [iv, authTag, content] = encrypted.split('.');
      
      // Tamper with auth tag
      const tamperedTag = 'XXXXXXXXXXXXXXXXXXX==';
      const tamperedData = `${iv}.${tamperedTag}.${content}`;

      expect(() => decryptField(tamperedData)).toThrow(/Failed to decrypt sensitive data/);

      process.env.NODE_ENV = originalEnv;
    });
  });
});
