import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { LocalCredentialService } from '../local-credential/local-credential.service';
import { AuditService } from '../audit/audit.service';
import { regenerateSession, saveSession, destroySession } from '../session-store/session.helpers';
import { GENERIC_LOGIN_ERROR_MESSAGE } from './generic-login-error';
import { maskEmail } from './mask-email';
import '../session-store/session.types';

export interface MeResult {
  userId: string;
  hasLocalCredential: boolean;
  hasTelegramIdentity: boolean;
  localEmailMasked?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly localCredential: LocalCredentialService,
    private readonly audit: AuditService,
  ) {}

  async register(email: string, password: string, req: Request): Promise<void> {
    const existing = await this.localCredential.findByEmail(email);
    if (existing) {
      await this.audit.record({
        action: 'REGISTER_LOCAL',
        result: 'FAILURE',
        requestCorrelationId: randomUUID(),
        detailsRedacted: { email: maskEmail(email), reason: 'EMAIL_TAKEN' },
      });
      throw new ConflictException('email đã được sử dụng');
    }

    const user = await this.prisma.user.create({ data: {} });
    await this.localCredential.createCredential(user.id, email, password);

    // Auto-login after register (BR-014 resolved: no email verification
    // required), with session regeneration to prevent fixation.
    await regenerateSession(req);
    req.session.userId = user.id;
    req.session.loginAt = Date.now();
    await saveSession(req);

    await this.audit.record({
      userId: user.id,
      action: 'REGISTER_LOCAL',
      result: 'SUCCESS',
      requestCorrelationId: randomUUID(),
      detailsRedacted: { email: maskEmail(email) },
    });
  }

  async login(email: string, password: string, req: Request): Promise<void> {
    const credential = await this.localCredential.findByEmail(email);

    if (!credential) {
      await this.audit.record({
        action: 'LOGIN_LOCAL_FAILED',
        result: 'FAILURE',
        requestCorrelationId: randomUUID(),
        detailsRedacted: { email: maskEmail(email), reason: 'UNKNOWN_EMAIL' },
      });
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR_MESSAGE);
    }

    if (this.localCredential.isLocked(credential)) {
      await this.audit.record({
        userId: credential.userId,
        action: 'LOGIN_LOCAL_LOCKED',
        result: 'FAILURE',
        requestCorrelationId: randomUUID(),
      });
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR_MESSAGE);
    }

    const valid = await this.localCredential.verifyPassword(credential.passwordHash, password);
    if (!valid) {
      await this.localCredential.recordFailedLogin(credential.id);
      await this.audit.record({
        userId: credential.userId,
        action: 'LOGIN_LOCAL_FAILED',
        result: 'FAILURE',
        requestCorrelationId: randomUUID(),
        detailsRedacted: { reason: 'PASSWORD_MISMATCH' },
      });
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR_MESSAGE);
    }

    await this.localCredential.recordSuccessfulLogin(credential.id);

    // Session fixation rule applies to local login exactly like Telegram claim.
    await regenerateSession(req);
    req.session.userId = credential.userId;
    req.session.loginAt = Date.now();
    await saveSession(req);

    await this.audit.record({
      userId: credential.userId,
      action: 'LOGIN_LOCAL_SUCCESS',
      result: 'SUCCESS',
      requestCorrelationId: randomUUID(),
    });
  }

  async logout(req: Request): Promise<void> {
    const userId = req.session.userId ?? null;
    await destroySession(req);
    await this.audit.record({
      userId,
      action: 'LOGOUT',
      result: 'SUCCESS',
      requestCorrelationId: randomUUID(),
    });
  }

  async me(userId: string): Promise<MeResult> {
    const [localCredential, telegramIdentity] = await Promise.all([
      this.localCredential.findByUserId(userId),
      this.prisma.telegramIdentity.findUnique({ where: { userId } }),
    ]);

    return {
      userId,
      hasLocalCredential: !!localCredential,
      hasTelegramIdentity: !!telegramIdentity,
      localEmailMasked: localCredential ? maskEmail(localCredential.email) : undefined,
    };
  }
}
