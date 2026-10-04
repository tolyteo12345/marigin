import {
  BadGatewayException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { BinanceConnection, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SecretVaultService } from '../secret-vault/secret-vault.service';
import { BinanceReadOnlyAdapterService } from '../binance-adapter/binance-read-only-adapter.service';
import { CrossMarginAccountResponse } from '../binance-adapter/binance-api.types';
import { ConnectionAuditService } from '../connection-audit/connection-audit.service';
import { CreateConnectionDto } from './dto/create-connection.dto';
import { ConnectionView, toConnectionView } from './connection-view';
import { isAuthErrorCode } from './binance-error-mapping';

// 2 sequential Binance calls (account + apiRestrictions), each capped at the
// adapter's own 10s request timeout, plus margin for the DB work around them.
// Deliberate simplification: holding a DB transaction open for the duration
// of 2 external HTTP calls is not ideal, but it is what lets us use
// pg_try_advisory_xact_lock (transaction-scoped, so lock acquire/release
// always happens on the same pooled connection — a session-scoped advisory
// lock would not have that guarantee under Prisma's connection pool).
// Acceptable ceiling for a single-instance, low-traffic MVP; if this needs to
// scale out, move the lock to Redis and only hold the DB transaction for the
// final write.
const VERIFY_TRANSACTION_TIMEOUT_MS = 25_000;

export interface AccountSnapshot {
  fetchedAt: string; // ISO-8601 UTC, per-call, never cached (BR-008/AC-005)
  accountType: string;
  marginLevel: string;
  totalAssetOfBtc: string;
  totalLiabilityOfBtc: string;
  totalNetAssetOfBtc: string;
  // Exposed for risk-engine (architecture/risk-engine.md BR-006/COND-001) —
  // Binance's own USDT-denominated collateral figure, no extra app-level
  // computation. Additive field, no change to existing callers/behavior.
  totalCollateralValueInUSDT: string;
  userAssets: CrossMarginAccountResponse['userAssets'];
}

@Injectable()
export class BinanceConnectionService {
  private readonly logger = new Logger(BinanceConnectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly secretVault: SecretVaultService,
    private readonly adapter: BinanceReadOnlyAdapterService,
    private readonly audit: ConnectionAuditService,
  ) {}

  async create(userId: string, dto: CreateConnectionDto): Promise<ConnectionView> {
    const apiKeyPayload = this.secretVault.encrypt(dto.apiKey.trim());
    const apiSecretPayload = this.secretVault.encrypt(dto.apiSecret.trim());

    const connection = await this.prisma.binanceConnection.create({
      data: {
        userId,
        label: dto.label.trim(),
        encryptedApiKey: apiKeyPayload.ciphertext,
        encryptionIv: apiKeyPayload.iv,
        encryptedApiSecret: apiSecretPayload.ciphertext,
        encryptionIvApiSecret: apiSecretPayload.iv,
        encryptionKeyVersion: apiKeyPayload.keyVersion,
        status: 'PENDING_VERIFY',
      },
    });

    await this.audit.record({
      userId,
      connectionId: connection.id,
      action: 'CONNECTION_ADDED',
      result: 'SUCCESS',
      requestCorrelationId: randomUUID(),
    });

    // Verify synchronously in the same request (MVP has no background job —
    // matches requirement "on-demand", architecture "API contracts" note).
    const verified = await this.verify(userId, connection.id);
    return toConnectionView(verified);
  }

  async list(userId: string): Promise<ConnectionView[]> {
    const connections = await this.prisma.binanceConnection.findMany({
      where: { userId, deletedAt: null }, // U-D01 resolved: REVOKED excluded from the list
      orderBy: { createdAt: 'desc' },
    });
    return connections.map(toConnectionView);
  }

  async getOne(userId: string, connectionId: string): Promise<ConnectionView> {
    return toConnectionView(await this.findOwnedOrThrow(userId, connectionId));
  }

  async verify(userId: string, connectionId: string): Promise<BinanceConnection> {
    return this.prisma.$transaction(
      async (tx) => {
        const connection = await tx.binanceConnection.findFirst({
          where: { id: connectionId, userId, deletedAt: null },
        });
        if (!connection) {
          throw new NotFoundException();
        }

        const lockRows = await tx.$queryRaw<{ locked: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(hashtextextended(${connectionId}, 0)) AS locked
        `;
        if (!lockRows[0]?.locked) {
          // A verify for this exact connection is already in flight — return
          // the current state instead of calling Binance a second time
          // (architecture doc "Verify đồng thời nhiều lần... per-connection lock").
          return connection;
        }

        const correlationId = randomUUID();
        let apiKey: string;
        let apiSecret: string;
        try {
          apiKey = this.secretVault.decrypt({
            ciphertext: connection.encryptedApiKey,
            iv: connection.encryptionIv,
            keyVersion: connection.encryptionKeyVersion,
          });
          apiSecret = this.secretVault.decrypt({
            ciphertext: connection.encryptedApiSecret,
            iv: connection.encryptionIvApiSecret,
            keyVersion: connection.encryptionKeyVersion,
          });
        } catch (err) {
          // Never let a decrypt failure (e.g. BINANCE_SECRET_ENCRYPTION_KEY
          // rotated without a data migration, or corrupted ciphertext) surface
          // as an unhandled 500 — treat it the same as "could not confirm",
          // not "credentials are wrong" (this is an operational problem, not
          // proof the user's Binance key itself is invalid).
          this.logger.error(`decrypt failed for connection ${connectionId}: ${(err as Error).message}`);
          await this.audit.record({ userId, connectionId, action: 'VERIFY_FAILED', result: 'ERROR', requestCorrelationId: correlationId });
          return tx.binanceConnection.update({
            where: { id: connectionId },
            data: {
              status: 'VERIFY_UNKNOWN',
              lastError: 'Không xác nhận được trạng thái (lỗi nội bộ khi đọc thông tin đã lưu).',
              lastVerifiedAt: new Date(),
            },
          });
        }

        await this.audit.record({
          userId,
          connectionId,
          action: 'VERIFY_ATTEMPTED',
          result: 'SUCCESS',
          requestCorrelationId: correlationId,
        });

        const accountResult = await this.adapter.getCrossMarginAccount(apiKey, apiSecret);
        const update: Prisma.BinanceConnectionUpdateInput = { lastVerifiedAt: new Date() };

        if (!accountResult.ok) {
          if (accountResult.kind === 'NETWORK_OR_TIMEOUT') {
            update.status = 'VERIFY_UNKNOWN';
            update.lastError = 'Không xác nhận được trạng thái (mất kết nối/hết thời gian chờ với Binance).';
            await this.audit.record({ userId, connectionId, action: 'VERIFY_FAILED', result: 'UNKNOWN_TIMEOUT', requestCorrelationId: correlationId });
          } else if (isAuthErrorCode(accountResult.binanceCode)) {
            update.status = 'INVALID';
            update.lastError = 'Kết nối không hợp lệ: API key hoặc secret sai hoặc đã hết hạn.';
            await this.audit.record({ userId, connectionId, action: 'VERIFY_FAILED', result: 'INVALID', requestCorrelationId: correlationId });
          } else {
            // Best-effort classification (RISK-001, NEEDS_VERIFICATION — see
            // binance-error-mapping.ts): any other error on this endpoint is
            // treated as "account never opened Cross Margin" (COND-002's 2nd branch).
            update.status = 'UNSUPPORTED_ACCOUNT_MODE';
            update.lastError = 'Tài khoản chưa mở Cross Margin, vui lòng mở Cross Margin Classic trên Binance trước.';
            await this.audit.record({ userId, connectionId, action: 'VERIFY_FAILED', result: 'UNSUPPORTED_ACCOUNT_MODE', requestCorrelationId: correlationId });
          }
        } else if (accountResult.data.accountType === 'MARGIN_2') {
          update.status = 'UNSUPPORTED_ACCOUNT_MODE';
          update.accountType = 'MARGIN_2';
          update.lastError = 'Tài khoản này là Cross Margin Pro, hệ thống chỉ hỗ trợ Cross Margin Classic.';
          await this.audit.record({ userId, connectionId, action: 'VERIFY_FAILED', result: 'UNSUPPORTED_ACCOUNT_MODE', requestCorrelationId: correlationId });
        } else {
          // accountType === 'MARGIN_1' (Cross Margin Classic) — verified.
          update.status = 'VERIFIED';
          update.accountType = accountResult.data.accountType;
          update.lastError = null;
          await this.audit.record({ userId, connectionId, action: 'VERIFY_SUCCEEDED', result: 'SUCCESS', requestCorrelationId: correlationId });

          // COND-003: permission scope check — fail-closed on any failure,
          // never silently treated as safe.
          const restrictions = await this.adapter.getApiKeyRestrictions(apiKey, apiSecret);
          if (restrictions.ok) {
            update.permissionSnapshot = { ...restrictions.data, checkedAt: new Date().toISOString() } as Prisma.InputJsonValue;
            update.permissionUnknown = false;
          } else {
            // Leave permissionSnapshot untouched (do not overwrite a
            // previously successful snapshot with null on a transient failure).
            update.permissionUnknown = true;
            await this.audit.record({ userId, connectionId, action: 'PERMISSION_CHECK_FAILED', result: 'ERROR', requestCorrelationId: correlationId });
          }
        }

        return tx.binanceConnection.update({ where: { id: connectionId }, data: update });
      },
      { timeout: VERIFY_TRANSACTION_TIMEOUT_MS },
    );
  }

  async revoke(userId: string, connectionId: string): Promise<void> {
    await this.findOwnedOrThrow(userId, connectionId);

    // Null out the secret in the same transaction as the status flip — no
    // window where a revoked row still holds a usable ciphertext.
    await this.prisma.binanceConnection.update({
      where: { id: connectionId },
      data: {
        status: 'REVOKED',
        deletedAt: new Date(),
        encryptedApiKey: Buffer.alloc(0),
        encryptedApiSecret: Buffer.alloc(0),
        encryptionIv: Buffer.alloc(0),
        encryptionIvApiSecret: Buffer.alloc(0),
      },
    });

    await this.audit.record({
      userId,
      connectionId,
      action: 'CONNECTION_REVOKED',
      result: 'SUCCESS',
      requestCorrelationId: randomUUID(),
    });
  }

  async getAccountSnapshot(userId: string, connectionId: string): Promise<AccountSnapshot> {
    const connection = await this.findOwnedOrThrow(userId, connectionId);
    if (connection.status !== 'VERIFIED') {
      throw new ForbiddenException('connection chưa được verify');
    }

    // Re-read the secret fresh right before calling Binance (architecture doc
    // "Concurrency" — never reuse an earlier-loaded secret), so a revoke that
    // commits between findOwnedOrThrow() above and here is observed here.
    const fresh = await this.prisma.binanceConnection.findFirst({
      where: { id: connectionId, userId, deletedAt: null },
    });
    if (!fresh) {
      throw new NotFoundException('connection đã bị xoá');
    }

    const correlationId = randomUUID();
    let apiKey: string;
    let apiSecret: string;
    try {
      apiKey = this.secretVault.decrypt({
        ciphertext: fresh.encryptedApiKey,
        iv: fresh.encryptionIv,
        keyVersion: fresh.encryptionKeyVersion,
      });
      apiSecret = this.secretVault.decrypt({
        ciphertext: fresh.encryptedApiSecret,
        iv: fresh.encryptionIvApiSecret,
        keyVersion: fresh.encryptionKeyVersion,
      });
    } catch (err) {
      // Same rationale as verify(): an operational key-rotation problem must
      // not surface as an unhandled 500.
      this.logger.error(`decrypt failed for connection ${connectionId}: ${(err as Error).message}`);
      await this.audit.record({ userId, connectionId, action: 'ACCOUNT_SNAPSHOT_READ', result: 'ERROR', requestCorrelationId: correlationId });
      throw new HttpException('Không thể tải dữ liệu (lỗi nội bộ khi đọc thông tin đã lưu), vui lòng thử lại.', 503);
    }

    const result = await this.adapter.getCrossMarginAccount(apiKey, apiSecret);
    const fetchedAt = new Date().toISOString();

    if (!result.ok) {
      if (result.kind === 'NETWORK_OR_TIMEOUT') {
        await this.audit.record({ userId, connectionId, action: 'ACCOUNT_SNAPSHOT_READ', result: 'UNKNOWN_TIMEOUT', requestCorrelationId: correlationId });
        throw new HttpException('Không thể tải dữ liệu (mất kết nối hoặc hết thời gian chờ), vui lòng thử lại.', 503);
      }
      if (result.httpStatus === 429 || result.httpStatus === 418) {
        await this.audit.record({ userId, connectionId, action: 'ACCOUNT_SNAPSHOT_READ', result: 'ERROR', requestCorrelationId: correlationId });
        throw new HttpException(
          {
            message: `Binance đang giới hạn tần suất truy cập, vui lòng thử lại sau ${result.retryAfterSeconds ?? 60} giây.`,
            retryAfterSeconds: result.retryAfterSeconds ?? 60,
          },
          429,
        );
      }
      if (isAuthErrorCode(result.binanceCode)) {
        await this.prisma.binanceConnection.updateMany({
          where: { id: connectionId, deletedAt: null },
          data: { status: 'INVALID', lastError: 'Kết nối không còn hợp lệ, vui lòng xác minh lại.' },
        });
        await this.audit.record({ userId, connectionId, action: 'ACCOUNT_SNAPSHOT_READ', result: 'INVALID', requestCorrelationId: correlationId });
        throw new UnauthorizedException('Kết nối không còn hợp lệ, vui lòng xác minh lại.');
      }
      await this.audit.record({ userId, connectionId, action: 'ACCOUNT_SNAPSHOT_READ', result: 'ERROR', requestCorrelationId: correlationId });
      throw new BadGatewayException(result.message);
    }

    await this.audit.record({ userId, connectionId, action: 'ACCOUNT_SNAPSHOT_READ', result: 'SUCCESS', requestCorrelationId: correlationId });

    return {
      fetchedAt,
      accountType: result.data.accountType,
      marginLevel: result.data.marginLevel,
      totalAssetOfBtc: result.data.totalAssetOfBtc,
      totalLiabilityOfBtc: result.data.totalLiabilityOfBtc,
      totalNetAssetOfBtc: result.data.totalNetAssetOfBtc,
      totalCollateralValueInUSDT: result.data.totalCollateralValueInUSDT,
      userAssets: result.data.userAssets,
    };
  }

  // Ownership guard (AC-006): 404 either way, never distinguishing "not
  // found" from "not yours" — chống IDOR enumeration.
  private async findOwnedOrThrow(userId: string, connectionId: string): Promise<BinanceConnection> {
    const connection = await this.prisma.binanceConnection.findFirst({
      where: { id: connectionId, userId, deletedAt: null },
    });
    if (!connection) {
      throw new NotFoundException();
    }
    return connection;
  }
}
