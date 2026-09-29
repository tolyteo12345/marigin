import { Body, Controller, Get, Headers, Param, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';
import { CsrfGuard } from '../csrf/csrf.guard';
import { AuditService } from '../audit/audit.service';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramUpdate } from './telegram-update.types';
import { regenerateSession, saveSession } from '../session-store/session.helpers';
import '../session-store/session.types';

@Controller('auth/telegram')
export class TelegramBotController {
  constructor(
    private readonly telegram: TelegramBotService,
    private readonly audit: AuditService,
  ) {}

  // POST /api/auth/telegram/start — session may be anonymous or authenticated;
  // purpose (LOGIN vs LINK) is derived server-side from the session, never from the client.
  @UseGuards(CsrfGuard)
  @Post('start')
  async start(@Req() req: Request) {
    const userId = req.session.userId ?? null;
    const result = await this.telegram.createLoginRequest({
      purpose: userId ? 'LINK' : 'LOGIN',
      initiatorSessionSid: req.session.id,
      linkingUserId: userId,
    });
    await this.audit.record({
      userId,
      action: 'TELEGRAM_LOGIN_REQUEST_CREATED',
      result: 'SUCCESS',
      requestCorrelationId: randomUUID(),
    });
    return result;
  }

  // GET /api/auth/telegram/status/:code
  @Get('status/:code')
  async status(@Param('code') code: string, @Req() req: Request) {
    const request = await this.telegram.getRequest(code);

    if (
      !request ||
      this.telegram.isExpired(request) ||
      !this.telegram.matchesInitiatorSession(request, req.session.id)
    ) {
      // Do not distinguish "not found" vs "expired" vs "wrong session" (AC-005c).
      return { status: 'EXPIRED' as const };
    }

    if (request.status === 'PENDING' || request.status === 'EXPIRED' || request.status === 'REJECTED' || request.status === 'CLAIMED') {
      return { status: request.status };
    }

    // status === 'CONFIRMED' -> attempt the atomic claim.
    const currentUserId = req.session.userId ?? null;
    const outcome = await this.telegram.claim(request, req.session.id, currentUserId);

    if (outcome.outcome === 'CLAIMED') {
      // Session fixation rule applies to Telegram claim exactly like local login.
      await regenerateSession(req);
      req.session.userId = outcome.userId;
      req.session.loginAt = Date.now();
      await saveSession(req);
      await this.audit.record({
        userId: outcome.userId,
        action: 'TELEGRAM_LOGIN_CLAIMED',
        result: 'SUCCESS',
        requestCorrelationId: randomUUID(),
      });
      return { status: 'CLAIMED' as const };
    }

    if (outcome.outcome === 'REJECTED') {
      await this.audit.record({
        userId: currentUserId,
        action: 'ACCOUNT_LINK_REJECTED',
        result: 'REJECTED',
        requestCorrelationId: randomUUID(),
      });
      return { status: 'REJECTED' as const, reason: outcome.reason };
    }

    // ALREADY_RESOLVED: lost a race against another concurrent claim on the
    // same code — re-read the now-settled state instead of guessing.
    const fresh = await this.telegram.getRequest(code);
    return { status: fresh?.status ?? 'EXPIRED' };
  }

  // POST /api/auth/telegram/webhook — Telegram infra calls this directly, no
  // browser session/CSRF applies. Secret token MUST be verified before
  // anything else is read/processed (COND-A05).
  @SkipThrottle()
  @Post('webhook')
  async webhook(
    @Headers('x-telegram-bot-api-secret-token') secretHeader: string | undefined,
    @Body() update: TelegramUpdate,
  ) {
    if (!this.telegram.verifyWebhookSecret(secretHeader)) {
      await this.audit.record({
        action: 'TELEGRAM_WEBHOOK_REJECTED',
        result: 'REJECTED',
        requestCorrelationId: randomUUID(),
      });
      throw new UnauthorizedException();
    }

    const text = update.message?.text;
    const from = update.message?.from;
    const code = this.telegram.parseStartCommand(text);

    if (code && from) {
      const confirmed = await this.telegram.confirmFromWebhook(code, from);
      if (confirmed) {
        await this.telegram.sendMessage(from.id, 'Xác nhận thành công, quay lại trình duyệt để tiếp tục.');
        await this.audit.record({
          action: 'TELEGRAM_LOGIN_CONFIRMED',
          result: 'SUCCESS',
          requestCorrelationId: randomUUID(),
        });
      } else {
        await this.telegram.sendMessage(from.id, 'Mã không hợp lệ hoặc đã hết hạn, vui lòng thử lại từ trình duyệt.');
      }
    }

    // Always 200 for Telegram, even on invalid/expired code, to avoid retries.
    return { ok: true };
  }
}
