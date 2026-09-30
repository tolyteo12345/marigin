import { ConflictException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthConfigService } from '../src/config/auth-config.service';
import { AuditService } from '../src/audit/audit.service';
import { LocalCredentialService } from '../src/local-credential/local-credential.service';
import { AccountLinkService } from '../src/account-link/account-link.service';

function p2002(target: string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '5.22.0',
    meta: { target },
  });
}

describe('AccountLinkService.linkLocal (AC-008, BR-004)', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let config: DeepMockProxy<AuthConfigService>;
  let audit: DeepMockProxy<AuditService>;
  let localCredential: LocalCredentialService;
  let service: AccountLinkService;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    config = mockDeep<AuthConfigService>();
    audit = mockDeep<AuditService>();
    localCredential = new LocalCredentialService(prisma, config);
    service = new AccountLinkService(localCredential, audit);
  });

  it('rejects when the email already belongs to a different user', async () => {
    prisma.localCredential.findUnique.mockResolvedValueOnce({ userId: 'user-b' } as never);

    await expect(service.linkLocal('user-a', 'taken@example.com', 'a long enough password')).rejects.toThrow(
      new ConflictException('email đã được sử dụng bởi tài khoản khác'),
    );
    expect(prisma.localCredential.create).not.toHaveBeenCalled();
  });

  it('rejects when the current user already has a local credential', async () => {
    prisma.localCredential.findUnique
      .mockResolvedValueOnce(null) // findByEmail: free
      .mockResolvedValueOnce({ userId: 'user-a' } as never); // findByUserId: already has one

    await expect(service.linkLocal('user-a', 'new@example.com', 'a long enough password')).rejects.toThrow(
      new ConflictException('tài khoản này đã có email/password'),
    );
    expect(prisma.localCredential.create).not.toHaveBeenCalled();
  });

  it('links successfully when the email is free and the user has no local credential yet', async () => {
    prisma.localCredential.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    prisma.localCredential.create.mockResolvedValueOnce({} as never);

    await expect(service.linkLocal('user-a', 'new@example.com', 'a long enough password')).resolves.toBeUndefined();
    expect(prisma.localCredential.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'user-a', email: 'new@example.com' }) }),
    );
  });

  // Regression: a race lost on the `email` unique constraint (2 different
  // users linking the same email concurrently) must report the email-taken
  // message, not conflate it with the userId race below.
  it('reports "email taken" when the create() race is lost on the email unique constraint', async () => {
    prisma.localCredential.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    prisma.localCredential.create.mockRejectedValueOnce(p2002(['email']));

    await expect(service.linkLocal('user-a', 'new@example.com', 'a long enough password')).rejects.toThrow(
      new ConflictException('email đã được sử dụng bởi tài khoản khác'),
    );
  });

  // Regression: a race lost on the `userId` unique constraint (2 tabs of the
  // same user linking different emails concurrently) must report "you already
  // have a credential" — previously this always reported "email taken" even
  // when the actual conflict was userId, which is misleading (see review.md).
  it('reports "already has a credential" when the create() race is lost on the userId unique constraint', async () => {
    prisma.localCredential.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    prisma.localCredential.create.mockRejectedValueOnce(p2002(['userId']));

    await expect(service.linkLocal('user-a', 'new@example.com', 'a long enough password')).rejects.toThrow(
      new ConflictException('tài khoản này đã có email/password'),
    );
  });
});
