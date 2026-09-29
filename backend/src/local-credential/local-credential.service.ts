import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { LocalCredential } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthConfigService } from '../config/auth-config.service';
import { ARGON2ID_OPTIONS } from '../common/constants';

// Password never logged/kept as plaintext anywhere in this service — only
// argon2id-hashed strings cross the PrismaService boundary.
@Injectable()
export class LocalCredentialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AuthConfigService,
  ) {}

  hashPassword(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id, ...ARGON2ID_OPTIONS });
  }

  verifyPassword(passwordHash: string, password: string): Promise<boolean> {
    return argon2.verify(passwordHash, password);
  }

  findByEmail(email: string): Promise<LocalCredential | null> {
    return this.prisma.localCredential.findUnique({ where: { email } });
  }

  findByUserId(userId: string): Promise<LocalCredential | null> {
    return this.prisma.localCredential.findUnique({ where: { userId } });
  }

  // Lockout state machine (architecture doc "Lockout"): a credential is
  // locked while lockedUntil is in the future.
  isLocked(credential: Pick<LocalCredential, 'lockedUntil'>, now: Date = new Date()): boolean {
    return !!credential.lockedUntil && credential.lockedUntil.getTime() > now.getTime();
  }

  async createCredential(userId: string, email: string, password: string): Promise<LocalCredential> {
    const passwordHash = await this.hashPassword(password);
    return this.prisma.localCredential.create({ data: { userId, email, passwordHash } });
  }

  // Atomic DB increment (no read-modify-write in application layer), then a
  // second update to set lockedUntil if the threshold was just crossed.
  // Accepted race window documented in architecture "Concurrency" section
  // (at most one extra request may slip through before the lock takes effect).
  async recordFailedLogin(credentialId: string): Promise<void> {
    const updated = await this.prisma.localCredential.update({
      where: { id: credentialId },
      data: { failedLoginCount: { increment: 1 } },
    });

    if (updated.failedLoginCount >= this.config.loginMaxAttempts) {
      await this.prisma.localCredential.update({
        where: { id: credentialId },
        data: {
          lockedUntil: new Date(Date.now() + this.config.loginLockoutMinutes * 60_000),
        },
      });
    }
  }

  async recordSuccessfulLogin(credentialId: string): Promise<void> {
    await this.prisma.localCredential.update({
      where: { id: credentialId },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  }
}
