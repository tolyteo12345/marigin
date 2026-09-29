import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthConfigService } from '../src/config/auth-config.service';
import { LocalCredentialService } from '../src/local-credential/local-credential.service';

describe('LocalCredentialService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let config: DeepMockProxy<AuthConfigService>;
  let service: LocalCredentialService;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    config = mockDeep<AuthConfigService>();
    // AUTH_LOGIN_MAX_ATTEMPTS=5 / AUTH_LOGIN_LOCKOUT_MINUTES=15 (BR-010).
    (config as unknown as { loginMaxAttempts: number }).loginMaxAttempts = 5;
    (config as unknown as { loginLockoutMinutes: number }).loginLockoutMinutes = 15;
    service = new LocalCredentialService(prisma, config);
  });

  describe('password hashing (argon2id)', () => {
    it('never stores the plaintext password and verifies correctly', async () => {
      const password = 'correct horse battery staple';
      const hash = await service.hashPassword(password);

      expect(hash).not.toEqual(password);
      expect(hash.startsWith('$argon2id$')).toBe(true);
      await expect(service.verifyPassword(hash, password)).resolves.toBe(true);
      await expect(service.verifyPassword(hash, 'wrong password')).resolves.toBe(false);
    });
  });

  describe('isLocked', () => {
    it('is not locked when lockedUntil is null', () => {
      expect(service.isLocked({ lockedUntil: null })).toBe(false);
    });

    it('is locked while lockedUntil is in the future', () => {
      const now = new Date('2026-01-01T00:00:00Z');
      const lockedUntil = new Date('2026-01-01T00:10:00Z');
      expect(service.isLocked({ lockedUntil }, now)).toBe(true);
    });

    it('is not locked once lockedUntil is in the past', () => {
      const now = new Date('2026-01-01T00:20:00Z');
      const lockedUntil = new Date('2026-01-01T00:10:00Z');
      expect(service.isLocked({ lockedUntil }, now)).toBe(false);
    });
  });

  describe('recordFailedLogin (lockout state machine, BR-010: 5 attempts / 15 min lockout)', () => {
    it('does not lock the account before reaching the threshold', async () => {
      prisma.localCredential.update.mockResolvedValueOnce({
        failedLoginCount: 3,
      } as never);

      await service.recordFailedLogin('cred-1');

      expect(prisma.localCredential.update).toHaveBeenCalledTimes(1);
      expect(prisma.localCredential.update).toHaveBeenCalledWith({
        where: { id: 'cred-1' },
        data: { failedLoginCount: { increment: 1 } },
      });
    });

    it('locks the account for 15 minutes once the 5th failed attempt is reached', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
      prisma.localCredential.update.mockResolvedValueOnce({
        failedLoginCount: 5,
      } as never);

      await service.recordFailedLogin('cred-1');

      expect(prisma.localCredential.update).toHaveBeenCalledTimes(2);
      expect(prisma.localCredential.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'cred-1' },
        data: { lockedUntil: new Date('2026-01-01T00:15:00Z') },
      });
      jest.useRealTimers();
    });
  });

  describe('recordSuccessfulLogin', () => {
    it('resets failedLoginCount and clears lockedUntil', async () => {
      await service.recordSuccessfulLogin('cred-1');
      expect(prisma.localCredential.update).toHaveBeenCalledWith({
        where: { id: 'cred-1' },
        data: { failedLoginCount: 0, lockedUntil: null },
      });
    });
  });
});
