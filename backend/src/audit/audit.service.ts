import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type AuthAuditAction =
  | 'REGISTER_LOCAL'
  | 'LOGIN_LOCAL_SUCCESS'
  | 'LOGIN_LOCAL_FAILED'
  | 'LOGIN_LOCAL_LOCKED'
  | 'TELEGRAM_LOGIN_REQUEST_CREATED'
  | 'TELEGRAM_LOGIN_CONFIRMED'
  | 'TELEGRAM_LOGIN_CLAIMED'
  | 'TELEGRAM_LOGIN_EXPIRED'
  | 'TELEGRAM_WEBHOOK_REJECTED'
  | 'LOGOUT'
  | 'ACCOUNT_LINK_TELEGRAM'
  | 'ACCOUNT_LINK_LOCAL'
  | 'ACCOUNT_LINK_REJECTED'
  | 'RATE_LIMITED';

export type AuthAuditResult = 'SUCCESS' | 'FAILURE' | 'REJECTED';

export interface RecordAuditEventInput {
  userId?: string | null;
  action: AuthAuditAction;
  result: AuthAuditResult;
  requestCorrelationId: string;
  // Caller is responsible for never including password/passwordHash/session
  // secret/bot token/session id here — see AuthAuditLog.detailsRedacted contract.
  detailsRedacted?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordAuditEventInput): Promise<void> {
    await this.prisma.authAuditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        result: input.result,
        requestCorrelationId: input.requestCorrelationId,
        detailsRedacted: input.detailsRedacted,
      },
    });
  }
}
