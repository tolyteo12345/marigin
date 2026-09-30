import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12; // 96-bit nonce, the recommended size for GCM
const AUTH_TAG_LENGTH_BYTES = 16;

export interface EncryptedPayload {
  ciphertext: Buffer; // encrypted bytes with the GCM auth tag appended (no separate DB column for it)
  iv: Buffer;
  keyVersion: number;
}

// Envelope encryption for BinanceConnection.encryptedApiKey/encryptedApiSecret
// (architecture doc "Secret storage"). MVP deliberate simplification: the
// master key comes straight from an env var (BINANCE_SECRET_ENCRYPTION_KEY),
// the same pattern already used for SESSION_SECRET — architecture explicitly
// leaves the actual KMS/keystore choice to the deploy environment, not to
// this feature. Ceiling: single master key, no rotation implemented yet
// (encryptionKeyVersion is stored per-row specifically so rotation can be
// added later without a schema change — just start writing keyVersion=2 and
// keep a version->key lookup instead of a single env var).
@Injectable()
export class SecretVaultService {
  constructor(private readonly config: ConfigService) {}

  private get currentKeyVersion(): number {
    return 1;
  }

  private masterKey(version: number): Buffer {
    if (version !== 1) {
      throw new Error(`no master key configured for encryptionKeyVersion=${version}`);
    }
    const raw = this.config.get<string>('BINANCE_SECRET_ENCRYPTION_KEY');
    if (!raw) {
      throw new Error('BINANCE_SECRET_ENCRYPTION_KEY env var is required');
    }
    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32) {
      throw new Error('BINANCE_SECRET_ENCRYPTION_KEY must decode (base64) to exactly 32 bytes for AES-256');
    }
    return key;
  }

  encrypt(plaintext: string): EncryptedPayload {
    const keyVersion = this.currentKeyVersion;
    const iv = randomBytes(IV_LENGTH_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.masterKey(keyVersion), iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return { ciphertext: Buffer.concat([encrypted, authTag]), iv, keyVersion };
  }

  decrypt(payload: EncryptedPayload): string {
    const authTag = payload.ciphertext.subarray(payload.ciphertext.length - AUTH_TAG_LENGTH_BYTES);
    const encrypted = payload.ciphertext.subarray(0, payload.ciphertext.length - AUTH_TAG_LENGTH_BYTES);
    const decipher = createDecipheriv(ALGORITHM, this.masterKey(payload.keyVersion), payload.iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }
}
