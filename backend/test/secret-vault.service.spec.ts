import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { SecretVaultService } from '../src/secret-vault/secret-vault.service';

function makeService(masterKeyBase64: string): SecretVaultService {
  const config = { get: (key: string) => (key === 'BINANCE_SECRET_ENCRYPTION_KEY' ? masterKeyBase64 : undefined) } as ConfigService;
  return new SecretVaultService(config);
}

describe('SecretVaultService (AES-256-GCM envelope encryption)', () => {
  const masterKey = randomBytes(32).toString('base64');

  it('round-trips plaintext through encrypt/decrypt', () => {
    const service = makeService(masterKey);
    const payload = service.encrypt('super-secret-api-key');
    expect(service.decrypt(payload)).toBe('super-secret-api-key');
  });

  it('never stores the plaintext inside the ciphertext bytes', () => {
    const service = makeService(masterKey);
    const payload = service.encrypt('super-secret-api-key');
    expect(payload.ciphertext.toString('utf8')).not.toContain('super-secret-api-key');
  });

  // Regression guard for the nonce-reuse fix (docs/DATABASE.md BinanceConnection
  // note): 2 independent encrypt() calls must never produce the same IV, since
  // BinanceConnection stores apiKey and apiSecret under the same master key.
  it('generates a fresh random IV on every call (no nonce reuse)', () => {
    const service = makeService(masterKey);
    const a = service.encrypt('value-a');
    const b = service.encrypt('value-b');
    expect(a.iv.equals(b.iv)).toBe(false);
  });

  it('fails to decrypt if the ciphertext was tampered with (GCM auth tag)', () => {
    const service = makeService(masterKey);
    const payload = service.encrypt('super-secret-api-key');
    payload.ciphertext[0] = payload.ciphertext[0] ^ 0xff;
    expect(() => service.decrypt(payload)).toThrow();
  });

  it('fails to decrypt with the wrong master key', () => {
    const service = makeService(masterKey);
    const payload = service.encrypt('super-secret-api-key');
    const otherService = makeService(randomBytes(32).toString('base64'));
    expect(() => otherService.decrypt(payload)).toThrow();
  });

  it('throws a clear error when BINANCE_SECRET_ENCRYPTION_KEY is missing', () => {
    const service = makeService(undefined as unknown as string);
    expect(() => service.encrypt('x')).toThrow('BINANCE_SECRET_ENCRYPTION_KEY env var is required');
  });

  it('throws a clear error when the key does not decode to exactly 32 bytes', () => {
    const service = makeService(Buffer.from('too-short').toString('base64'));
    expect(() => service.encrypt('x')).toThrow('exactly 32 bytes');
  });
});
