import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { LocalCredentialService } from '../local-credential/local-credential.service';
import { AuditService } from '../audit/audit.service';
import { maskEmail } from '../auth/mask-email';

@Injectable()
export class AccountLinkService {
  constructor(
    private readonly localCredential: LocalCredentialService,
    private readonly audit: AuditService,
  ) {}

  // BR-004 / AC-008: 409 if the email already belongs to a different user,
  // or if the current user already has a local credential — never merge.
  async linkLocal(userId: string, email: string, password: string): Promise<void> {
    const existingByEmail = await this.localCredential.findByEmail(email);
    if (existingByEmail) {
      await this.audit.record({
        userId,
        action: 'ACCOUNT_LINK_REJECTED',
        result: 'REJECTED',
        requestCorrelationId: randomUUID(),
        detailsRedacted: { email: maskEmail(email), reason: 'EMAIL_TAKEN' },
      });
      throw new ConflictException('email đã được sử dụng bởi tài khoản khác');
    }

    const existingByUser = await this.localCredential.findByUserId(userId);
    if (existingByUser) {
      await this.audit.record({
        userId,
        action: 'ACCOUNT_LINK_REJECTED',
        result: 'REJECTED',
        requestCorrelationId: randomUUID(),
        detailsRedacted: { reason: 'USER_ALREADY_HAS_LOCAL_CREDENTIAL' },
      });
      throw new ConflictException('tài khoản này đã có email/password');
    }

    try {
      await this.localCredential.createCredential(userId, email, password);
    } catch (err) {
      // Defense-in-depth against the same race the DB unique constraints guard
      // (TOCTOU between the reads above and this write — e.g. 2 concurrent
      // linkLocal calls for the same user, or for the same email). `target`
      // tells us which unique constraint actually lost the race, so the
      // rejection reason matches AC-008's 2 distinct cases instead of always
      // reporting "email taken" even when it was really "user already has a
      // credential" that raced.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const target = err.meta?.target;
        const hitUserIdConstraint = Array.isArray(target) && target.includes('userId');

        await this.audit.record({
          userId,
          action: 'ACCOUNT_LINK_REJECTED',
          result: 'REJECTED',
          requestCorrelationId: randomUUID(),
          detailsRedacted: { reason: hitUserIdConstraint ? 'USER_ALREADY_HAS_LOCAL_CREDENTIAL_RACE' : 'EMAIL_TAKEN_RACE' },
        });
        throw new ConflictException(
          hitUserIdConstraint ? 'tài khoản này đã có email/password' : 'email đã được sử dụng bởi tài khoản khác',
        );
      }
      throw err;
    }

    await this.audit.record({
      userId,
      action: 'ACCOUNT_LINK_LOCAL',
      result: 'SUCCESS',
      requestCorrelationId: randomUUID(),
      detailsRedacted: { email: maskEmail(email) },
    });
  }
}
