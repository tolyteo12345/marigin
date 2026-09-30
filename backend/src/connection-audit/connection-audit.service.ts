import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type ConnectionAuditAction =
  | 'CONNECTION_ADDED'
  | 'VERIFY_ATTEMPTED'
  | 'VERIFY_SUCCEEDED'
  | 'VERIFY_FAILED'
  | 'ACCOUNT_SNAPSHOT_READ'
  | 'PERMISSION_CHECK_FAILED'
  | 'CONNECTION_REVOKED';

export type ConnectionAuditResult = 'SUCCESS' | 'INVALID' | 'UNSUPPORTED_ACCOUNT_MODE' | 'UNKNOWN_TIMEOUT' | 'ERROR';

export interface RecordConnectionAuditEventInput {
  userId: string;
  connectionId: string;
  action: ConnectionAuditAction;
  result: ConnectionAuditResult;
  requestCorrelationId: string;
  // Caller MUST NEVER include apiKey/apiSecret (plaintext or ciphertext) here.
  detailsRedacted?: Prisma.InputJsonValue;
}

@Injectable()
export class ConnectionAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordConnectionAuditEventInput): Promise<void> {
    await this.prisma.connectionAuditLog.create({
      data: {
        userId: input.userId,
        connectionId: input.connectionId,
        action: input.action,
        result: input.result,
        requestCorrelationId: input.requestCorrelationId,
        detailsRedacted: input.detailsRedacted,
      },
    });
  }
}
