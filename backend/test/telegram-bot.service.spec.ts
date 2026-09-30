import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthConfigService } from '../src/config/auth-config.service';
import { AuditService } from '../src/audit/audit.service';
import { TelegramBotService } from '../src/telegram-bot/telegram-bot.service';
import { Prisma, TelegramLoginRequest } from '@prisma/client';

function makeRequest(overrides: Partial<TelegramLoginRequest> = {}): TelegramLoginRequest {
  return {
    code: 'code-123',
    purpose: 'LOGIN',
    linkingUserId: null,
    initiatorSessionSid: 'session-A',
    status: 'CONFIRMED',
    telegramUserId: BigInt(555),
    telegramUsername: 'someone',
    firstName: 'First',
    lastName: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    expiresAt: new Date('2026-01-01T00:05:00Z'),
    confirmedAt: new Date('2026-01-01T00:01:00Z'),
    claimedAt: null,
    ...overrides,
  };
}

describe('TelegramBotService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let config: DeepMockProxy<AuthConfigService>;
  let audit: DeepMockProxy<AuditService>;
  let service: TelegramBotService;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    config = mockDeep<AuthConfigService>();
    audit = mockDeep<AuditService>();
    (config as unknown as { telegramBotUsername: string }).telegramBotUsername = 'my_bot';
    // $transaction: mockDeep does not auto-run the callback, wire it manually
    // to invoke the callback with the same mocked client (jest-mock-extended pattern).
    (prisma.$transaction as unknown as jest.Mock).mockImplementation((cb: (tx: PrismaService) => unknown) => cb(prisma));
    service = new TelegramBotService(prisma, config, audit);
  });

  describe('generateCode (COND-A06: 256-bit entropy, base64url)', () => {
    it('produces a base64url string with no reserved deep-link characters', () => {
      const code = service.generateCode();
      expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(code.length).toBeLessThanOrEqual(64);
    });

    it('does not repeat across calls', () => {
      const codes = new Set(Array.from({ length: 20 }, () => service.generateCode()));
      expect(codes.size).toBe(20);
    });
  });

  describe('isExpired', () => {
    it('is expired once expiresAt has passed', () => {
      const request = makeRequest({ expiresAt: new Date('2026-01-01T00:05:00Z') });
      expect(service.isExpired(request, new Date('2026-01-01T00:05:01Z'))).toBe(true);
    });

    it('is not expired before expiresAt', () => {
      const request = makeRequest({ expiresAt: new Date('2026-01-01T00:05:00Z') });
      expect(service.isExpired(request, new Date('2026-01-01T00:04:59Z'))).toBe(false);
    });
  });

  describe('parseStartCommand', () => {
    it('extracts the code from "/start <code>"', () => {
      expect(service.parseStartCommand('/start abcDEF123_-')).toBe('abcDEF123_-');
    });

    it('returns null for anything else', () => {
      expect(service.parseStartCommand('hello')).toBeNull();
      expect(service.parseStartCommand(undefined)).toBeNull();
      expect(service.parseStartCommand('/start')).toBeNull();
    });
  });

  describe('confirmFromUpdate (atomic PENDING -> CONFIRMED)', () => {
    it('confirms when exactly one PENDING row matches (first delivery)', async () => {
      prisma.telegramLoginRequest.updateMany.mockResolvedValueOnce({ count: 1 });

      const confirmed = await service.confirmFromUpdate('code-1', { id: 555, username: 'u' });

      expect(confirmed).toBe(true);
      expect(prisma.telegramLoginRequest.updateMany).toHaveBeenCalledWith({
        where: { code: 'code-1', status: 'PENDING', expiresAt: { gt: expect.any(Date) } },
        data: expect.objectContaining({ status: 'CONFIRMED', telegramUserId: BigInt(555) }),
      });
    });

    it('does not re-confirm on a redelivered update (0 rows matched)', async () => {
      prisma.telegramLoginRequest.updateMany.mockResolvedValueOnce({ count: 0 });

      const confirmed = await service.confirmFromUpdate('code-1', { id: 555 });

      expect(confirmed).toBe(false);
    });
  });

  describe('claim — purpose LOGIN', () => {
    it('creates a new User + TelegramIdentity when telegramUserId is unseen', async () => {
      const request = makeRequest({ purpose: 'LOGIN' });
      prisma.telegramIdentity.findUnique.mockResolvedValueOnce(null);
      prisma.user.create.mockResolvedValueOnce({ id: 'user-new' } as never);
      prisma.telegramLoginRequest.updateMany.mockResolvedValueOnce({ count: 1 });

      const outcome = await service.claim(request, 'session-A', null);

      expect(outcome).toEqual({ outcome: 'CLAIMED', userId: 'user-new' });
      expect(prisma.telegramIdentity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: 'user-new', telegramUserId: BigInt(555) }),
      });
    });

    it('reuses the existing User when telegramUserId already has an identity', async () => {
      const request = makeRequest({ purpose: 'LOGIN' });
      prisma.telegramIdentity.findUnique.mockResolvedValueOnce({ userId: 'user-existing' } as never);
      prisma.telegramLoginRequest.updateMany.mockResolvedValueOnce({ count: 1 });

      const outcome = await service.claim(request, 'session-A', null);

      expect(outcome).toEqual({ outcome: 'CLAIMED', userId: 'user-existing' });
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('returns ALREADY_RESOLVED when a concurrent claim already won the race', async () => {
      const request = makeRequest({ purpose: 'LOGIN' });
      prisma.telegramIdentity.findUnique.mockResolvedValueOnce(null);
      prisma.user.create.mockResolvedValueOnce({ id: 'user-new' } as never);
      prisma.telegramLoginRequest.updateMany.mockResolvedValueOnce({ count: 0 });

      const outcome = await service.claim(request, 'session-A', null);

      expect(outcome).toEqual({ outcome: 'ALREADY_RESOLVED' });
    });

    it('rejects a claim attempted from a different session than the initiator (AC-005c)', async () => {
      const request = makeRequest({ purpose: 'LOGIN', initiatorSessionSid: 'session-A' });

      const outcome = await service.claim(request, 'session-B', null);

      expect(outcome).toEqual({ outcome: 'REJECTED', reason: 'INVALID_REQUEST' });
      expect(prisma.telegramIdentity.findUnique).not.toHaveBeenCalled();
    });

    // Regression test: a concurrent claim of the same CONFIRMED code (double-poll
    // from 2 tabs) can lose the TelegramIdentity.telegramUserId unique-constraint
    // race between this request's findUnique (returns null) and its own create.
    // Must converge onto the winner's userId instead of throwing (previously an
    // uncaught P2002 surfaced as an unhandled 500 — see review.md finding).
    it('recovers onto the winning userId when a concurrent claim wins the create race', async () => {
      const request = makeRequest({ purpose: 'LOGIN' });
      prisma.telegramIdentity.findUnique.mockResolvedValueOnce(null); // initial check: not seen yet
      prisma.telegramIdentity.findUniqueOrThrow.mockResolvedValueOnce({ userId: 'user-winner' } as never);
      prisma.user.create.mockResolvedValueOnce({ id: 'user-loser' } as never);
      prisma.telegramIdentity.create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`telegramUserId`)', {
          code: 'P2002',
          clientVersion: '5.22.0',
        }),
      );
      // The winner's transaction already committed status=CLAIMED by the time
      // this transaction's insert is unblocked, so this updateMany matches 0 rows.
      prisma.telegramLoginRequest.updateMany.mockResolvedValueOnce({ count: 0 });

      const outcome = await service.claim(request, 'session-A', null);

      expect(outcome).toEqual({ outcome: 'ALREADY_RESOLVED' });
    });
  });

  describe('claim — purpose LINK (BR-004)', () => {
    it('links successfully when telegramUserId is not linked to anyone', async () => {
      const request = makeRequest({ purpose: 'LINK', linkingUserId: 'user-a' });
      prisma.telegramIdentity.findUnique.mockResolvedValueOnce(null);
      prisma.telegramLoginRequest.updateMany.mockResolvedValueOnce({ count: 1 });

      const outcome = await service.claim(request, 'session-A', 'user-a');

      expect(outcome).toEqual({ outcome: 'CLAIMED', userId: 'user-a' });
      expect(prisma.telegramIdentity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: 'user-a' }),
      });
    });

    it('rejects when the telegramUserId is already linked to a different user', async () => {
      const request = makeRequest({ purpose: 'LINK', linkingUserId: 'user-a' });
      prisma.telegramIdentity.findUnique.mockResolvedValueOnce({ userId: 'user-b' } as never);

      const outcome = await service.claim(request, 'session-A', 'user-a');

      expect(outcome).toEqual({ outcome: 'REJECTED', reason: 'ALREADY_LINKED_TO_ANOTHER_USER' });
      expect(prisma.telegramLoginRequest.updateMany).toHaveBeenCalledWith({
        where: { code: request.code, status: 'CONFIRMED' },
        data: { status: 'REJECTED' },
      });
    });

    it('rejects when the current session user does not match linkingUserId', async () => {
      const request = makeRequest({ purpose: 'LINK', linkingUserId: 'user-a' });

      const outcome = await service.claim(request, 'session-A', 'user-other');

      expect(outcome).toEqual({ outcome: 'REJECTED', reason: 'SESSION_MISMATCH' });
    });
  });
});
