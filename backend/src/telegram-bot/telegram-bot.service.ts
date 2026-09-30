import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';
import { Prisma, TelegramLoginRequest } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthConfigService } from '../config/auth-config.service';
import { AuditService } from '../audit/audit.service';
import { TELEGRAM_CODE_TTL_SECONDS } from '../common/constants';
import { TelegramFrom, TelegramUpdate } from './telegram-update.types';

export type TelegramLoginPurpose = 'LOGIN' | 'LINK';

export interface CreateLoginRequestParams {
  purpose: TelegramLoginPurpose;
  initiatorSessionSid: string;
  linkingUserId: string | null;
}

export interface CreateLoginRequestResult {
  code: string;
  deepLinkUrl: string;
  expiresAt: Date;
}

export type ClaimOutcome =
  | { outcome: 'CLAIMED'; userId: string }
  | { outcome: 'REJECTED'; reason: string }
  | { outcome: 'ALREADY_RESOLVED' };

// TelegramBotModule is the ONLY boundary allowed to call the Telegram Bot API
// or trust its update payloads (architecture doc "Ranh giới an toàn"). No
// other service should read a raw Telegram Update directly.
@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotService.name);

  // In-memory only (architecture doc "Long-polling loop" — not persisted
  // because the idempotent PENDING->CONFIRMED transition already makes
  // reprocessing a redelivered update a safe no-op after a restart).
  private pollingOffset: number | undefined;
  private polling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AuthConfigService,
    private readonly audit: AuditService,
  ) {}

  // Bootstrap: drop any previously registered webhook (getUpdates refuses to
  // work otherwise — core.telegram.org/bots/api#getupdates) then start the
  // long-polling loop in the background.
  async onModuleInit(): Promise<void> {
    try {
      await this.deleteWebhook();
    } catch (err) {
      this.logger.warn(`Telegram deleteWebhook failed at bootstrap: ${(err as Error).message}`);
    }
    this.polling = true;
    void this.pollLoop();
  }

  onModuleDestroy(): void {
    this.polling = false;
  }

  private async pollLoop(): Promise<void> {
    while (this.polling) {
      let updates: TelegramUpdate[];
      try {
        updates = await this.getUpdates();
      } catch (err) {
        this.logger.warn(`Telegram getUpdates failed: ${(err as Error).message}`);
        // Deliberate simplification: fixed backoff on error instead of
        // exponential — acceptable because getUpdates itself long-polls
        // (up to 30s), so a tight error loop is already rate-limited in
        // the common case; this only guards the immediate-failure case
        // (e.g. bad token) from spinning.
        await new Promise((resolve) => setTimeout(resolve, 5000));
        continue;
      }
      for (const update of updates) {
        await this.handleUpdate(update);
        if (update.update_id !== undefined) {
          this.pollingOffset = update.update_id + 1;
        }
      }
    }
  }

  private async getUpdates(): Promise<TelegramUpdate[]> {
    const response = (await this.callBotApi('getUpdates', {
      offset: this.pollingOffset,
      timeout: 30,
      allowed_updates: ['message'],
    })) as { ok?: boolean; result?: TelegramUpdate[] } | null;
    return response?.result ?? [];
  }

  private async handleUpdate(update: TelegramUpdate): Promise<void> {
    const text = update.message?.text;
    const from = update.message?.from;
    const code = this.parseStartCommand(text);
    if (!code || !from) {
      return;
    }

    const confirmed = await this.confirmFromUpdate(code, from);
    if (confirmed) {
      await this.sendMessage(from.id, 'Xác nhận thành công, quay lại trình duyệt để tiếp tục.');
      await this.audit.record({
        action: 'TELEGRAM_LOGIN_CONFIRMED',
        result: 'SUCCESS',
        requestCorrelationId: randomUUID(),
      });
    } else {
      await this.sendMessage(from.id, 'Mã không hợp lệ hoặc đã hết hạn, vui lòng thử lại từ trình duyệt.');
    }
  }

  // COND-A06 resolved: 256-bit entropy, base64url so it satisfies Telegram's
  // deep-link start-parameter constraint (A-Za-z0-9_- and <=64 chars) naturally.
  generateCode(): string {
    return randomBytes(32).toString('base64url');
  }

  async createLoginRequest(params: CreateLoginRequestParams): Promise<CreateLoginRequestResult> {
    const code = this.generateCode();
    const expiresAt = new Date(Date.now() + TELEGRAM_CODE_TTL_SECONDS * 1000);
    await this.prisma.telegramLoginRequest.create({
      data: {
        code,
        purpose: params.purpose,
        linkingUserId: params.linkingUserId,
        initiatorSessionSid: params.initiatorSessionSid,
        expiresAt,
      },
    });
    return {
      code,
      deepLinkUrl: `https://t.me/${this.config.telegramBotUsername}?start=${code}`,
      expiresAt,
    };
  }

  getRequest(code: string): Promise<TelegramLoginRequest | null> {
    return this.prisma.telegramLoginRequest.findUnique({ where: { code } });
  }

  isExpired(request: Pick<TelegramLoginRequest, 'expiresAt'>, now: Date = new Date()): boolean {
    return request.expiresAt.getTime() <= now.getTime();
  }

  // AC-005c: a code may only be polled/claimed by the exact session that created it.
  matchesInitiatorSession(request: Pick<TelegramLoginRequest, 'initiatorSessionSid'>, sessionSid: string): boolean {
    return request.initiatorSessionSid === sessionSid;
  }

  parseStartCommand(text: string | undefined): string | null {
    if (!text) {
      return null;
    }
    const match = /^\/start\s+(\S+)$/.exec(text.trim());
    return match ? match[1] : null;
  }

  // Atomic PENDING -> CONFIRMED transition. The WHERE clause (not a prior
  // read) is what makes this safe against getUpdates redelivering the same
  // update after a restart (offset not yet acked) — a duplicate call simply
  // matches 0 rows.
  async confirmFromUpdate(code: string, from: TelegramFrom): Promise<boolean> {
    const result = await this.prisma.telegramLoginRequest.updateMany({
      where: { code, status: 'PENDING', expiresAt: { gt: new Date() } },
      data: {
        status: 'CONFIRMED',
        telegramUserId: BigInt(from.id),
        telegramUsername: from.username ?? null,
        firstName: from.first_name ?? null,
        lastName: from.last_name ?? null,
        confirmedAt: new Date(),
      },
    });
    return result.count === 1;
  }

  // Atomic CONFIRMED -> CLAIMED/REJECTED transition, executed inside a
  // transaction. The DB unique constraints on TelegramIdentity (userId,
  // telegramUserId) are the primary defense against the link race (BR-004),
  // not the read-then-write existence check below (defense-in-depth only).
  async claim(request: TelegramLoginRequest, sessionSid: string, currentUserId: string | null): Promise<ClaimOutcome> {
    if (!this.matchesInitiatorSession(request, sessionSid) || request.telegramUserId === null) {
      return { outcome: 'REJECTED', reason: 'INVALID_REQUEST' };
    }

    return this.prisma.$transaction(async (tx) => {
      if (request.purpose === 'LOGIN') {
        let userId: string;
        const existingIdentity = await tx.telegramIdentity.findUnique({
          where: { telegramUserId: request.telegramUserId! },
        });
        if (existingIdentity) {
          userId = existingIdentity.userId;
          await tx.telegramIdentity.update({
            where: { userId },
            data: { lastLoginAt: new Date() },
          });
        } else {
          try {
            const user = await tx.user.create({ data: {} });
            userId = user.id;
            await tx.telegramIdentity.create({
              data: {
                userId,
                telegramUserId: request.telegramUserId!,
                telegramUsername: request.telegramUsername,
                firstName: request.firstName,
                lastName: request.lastName,
              },
            });
          } catch (err) {
            // Same race as the LINK branch below: a concurrent claim of this
            // exact CONFIRMED code (double-poll/2 tabs) can win the
            // TelegramIdentity.telegramUserId unique constraint first. Recover
            // by reading the identity it just created instead of throwing —
            // for LOGIN there is no ownership conflict to reject (both
            // requests are the same Telegram user), so this request should
            // converge onto the same userId rather than surface a 500.
            if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
              const winner = await tx.telegramIdentity.findUniqueOrThrow({
                where: { telegramUserId: request.telegramUserId! },
              });
              userId = winner.userId;
            } else {
              throw err;
            }
          }
        }

        const updated = await tx.telegramLoginRequest.updateMany({
          where: { code: request.code, status: 'CONFIRMED' },
          data: { status: 'CLAIMED', claimedAt: new Date() },
        });
        if (updated.count === 0) {
          return { outcome: 'ALREADY_RESOLVED' };
        }
        return { outcome: 'CLAIMED', userId };
      }

      // purpose === LINK
      if (currentUserId === null || currentUserId !== request.linkingUserId) {
        return { outcome: 'REJECTED', reason: 'SESSION_MISMATCH' };
      }

      const existingIdentity = await tx.telegramIdentity.findUnique({
        where: { telegramUserId: request.telegramUserId! },
      });
      if (existingIdentity && existingIdentity.userId !== currentUserId) {
        await tx.telegramLoginRequest.updateMany({
          where: { code: request.code, status: 'CONFIRMED' },
          data: { status: 'REJECTED' },
        });
        return { outcome: 'REJECTED', reason: 'ALREADY_LINKED_TO_ANOTHER_USER' };
      }

      if (!existingIdentity) {
        try {
          await tx.telegramIdentity.create({
            data: {
              userId: currentUserId,
              telegramUserId: request.telegramUserId!,
              telegramUsername: request.telegramUsername,
              firstName: request.firstName,
              lastName: request.lastName,
            },
          });
        } catch (err) {
          // Unique constraint race lost between the read above and this write.
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            await tx.telegramLoginRequest.updateMany({
              where: { code: request.code, status: 'CONFIRMED' },
              data: { status: 'REJECTED' },
            });
            return { outcome: 'REJECTED', reason: 'ALREADY_LINKED_TO_ANOTHER_USER' };
          }
          throw err;
        }
      }

      const updated = await tx.telegramLoginRequest.updateMany({
        where: { code: request.code, status: 'CONFIRMED' },
        data: { status: 'CLAIMED', claimedAt: new Date() },
      });
      if (updated.count === 0) {
        return { outcome: 'ALREADY_RESOLVED' };
      }
      return { outcome: 'CLAIMED', userId: currentUserId };
    });
  }

  // --- Telegram Bot API boundary (HTTPS fetch, no bot framework dependency) ---

  private async callBotApi(method: string, body: unknown): Promise<unknown> {
    const url = `https://api.telegram.org/bot${this.config.telegramBotToken}/${method}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      this.logger.warn(`Telegram Bot API call ${method} failed with status ${response.status}`);
    }
    return response.json().catch(() => null);
  }

  sendMessage(chatId: number, text: string): Promise<unknown> {
    return this.callBotApi('sendMessage', { chat_id: chatId, text });
  }

  deleteWebhook(): Promise<unknown> {
    return this.callBotApi('deleteWebhook', {});
  }
}
