/**
 * Component: Encryption Service Tests
 * Documentation: documentation/backend/services/config.md
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_KEY = process.env.CONFIG_ENCRYPTION_KEY;

afterEach(() => {
  process.env.CONFIG_ENCRYPTION_KEY = ORIGINAL_KEY;
  vi.resetModules();
});

describe('EncryptionService', () => {
  it('throws when encryption key is missing', async () => {
    delete process.env.CONFIG_ENCRYPTION_KEY;
    vi.resetModules();

    const { EncryptionService } = await import('@/lib/services/encryption.service');
    expect(() => new EncryptionService()).toThrow(/CONFIG_ENCRYPTION_KEY/);
  });

  it('encrypts and decrypts values', async () => {
    process.env.CONFIG_ENCRYPTION_KEY = 'a'.repeat(32);
    vi.resetModules();

    const { EncryptionService } = await import('@/lib/services/encryption.service');
    const service = new EncryptionService();

    const encrypted = service.encrypt('secret');
    const decrypted = service.decrypt(encrypted);

    expect(decrypted).toBe('secret');
  });

  it('rejects invalid encrypted data formats', async () => {
    process.env.CONFIG_ENCRYPTION_KEY = 'b'.repeat(32);
    vi.resetModules();

    const { EncryptionService } = await import('@/lib/services/encryption.service');
    const service = new EncryptionService();

    expect(() => service.decrypt('invalid')).toThrow(/Decryption failed/);
  });

  it('generates a random key', async () => {
    const { EncryptionService } = await import('@/lib/services/encryption.service');
    const key = EncryptionService.generateKey();

    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(40);
  });

  describe('isEncryptedFormat', () => {
    async function createService() {
      process.env.CONFIG_ENCRYPTION_KEY = 'c'.repeat(32);
      vi.resetModules();
      const { EncryptionService } = await import('@/lib/services/encryption.service');
      return new EncryptionService();
    }

    it('returns true for values produced by encrypt()', async () => {
      const service = await createService();

      const encrypted = service.encrypt('hello world');
      expect(service.isEncryptedFormat(encrypted)).toBe(true);
    });

    it('returns true for various encrypted values (round-trip)', async () => {
      const service = await createService();

      const testValues = [
        'simple',
        'tgram://1234567890:PLPe1Hh-VhbRC3MoT5QngwkPHoMTD/-100181291455/',
        'slack://tokenA/tokenB/tokenC',
        'https://hooks.slack.com/services/T00/B00/xxx',
        'a',
        'a'.repeat(1000),
        'json://user:password@host:8080/path',
      ];

      for (const val of testValues) {
        const encrypted = service.encrypt(val);
        expect(service.isEncryptedFormat(encrypted)).toBe(true);
        expect(service.decrypt(encrypted)).toBe(val);
      }
    });

    it('returns false for Telegram notification URLs (the reported bug)', async () => {
      const service = await createService();

      // This URL has exactly 3 colon-separated parts, which fooled the old check
      expect(service.isEncryptedFormat(
        'tgram://1234567890:PLPe1Hh-VhbRC3MoT5QngwkPHoMTD/-100181291455/'
      )).toBe(false);
    });

    it('returns false for common notification URL schemes', async () => {
      const service = await createService();

      const urls = [
        'slack://tokenA/tokenB/tokenC',
        'discord://webhook_id/webhook_token',
        'mailto://user:pass@gmail.com',
        'json://user:pass@hostname',
        'https://hooks.slack.com/services/T00/B00/xxx',
        'gotify://hostname/token',
        'ntfy://topic',
        'tgram://bot_token:chat_id/',
      ];

      for (const url of urls) {
        expect(service.isEncryptedFormat(url)).toBe(false);
      }
    });

    it('returns false for non-string values', async () => {
      const service = await createService();

      expect(service.isEncryptedFormat(null as any)).toBe(false);
      expect(service.isEncryptedFormat(undefined as any)).toBe(false);
      expect(service.isEncryptedFormat(123 as any)).toBe(false);
      expect(service.isEncryptedFormat({} as any)).toBe(false);
    });

    it('returns false for strings with wrong number of colon parts', async () => {
      const service = await createService();

      expect(service.isEncryptedFormat('no-colons-at-all')).toBe(false);
      expect(service.isEncryptedFormat('one:part')).toBe(false);
      expect(service.isEncryptedFormat('a:b:c:d')).toBe(false);
    });

    it('returns false for 3-part strings with invalid base64', async () => {
      const service = await createService();

      // Contains characters not in base64 alphabet
      expect(service.isEncryptedFormat('not base64!:also not!:data')).toBe(false);
      expect(service.isEncryptedFormat('//invalid:##bad:data')).toBe(false);
    });

    it('returns false for 3-part base64 strings with wrong decoded lengths', async () => {
      const service = await createService();

      // Valid base64, but wrong byte lengths (not 16 bytes each)
      const shortIv = Buffer.from('short').toString('base64');        // 5 bytes
      const shortTag = Buffer.from('alsoshort').toString('base64');    // 9 bytes
      const data = Buffer.from('somedata').toString('base64');

      expect(service.isEncryptedFormat(`${shortIv}:${shortTag}:${data}`)).toBe(false);
    });

    it('returns false for empty string', async () => {
      const service = await createService();
      expect(service.isEncryptedFormat('')).toBe(false);
    });

    it('returns false for 3-part string with empty segments', async () => {
      const service = await createService();
      expect(service.isEncryptedFormat('::data')).toBe(false);
      expect(service.isEncryptedFormat('iv::data')).toBe(false);
      expect(service.isEncryptedFormat('iv:tag:')).toBe(false);
    });
  });
});
