import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';
import { CsrfGuard } from '../csrf/csrf.guard';
import { AuditService } from '../audit/audit.service';
import { TelegramBotService } from './telegram-bot.service';
import { regenerateSession, saveSession } from '../session-store/session.helpers';
import '../session-store/session.types';

@ApiTags('auth')
@Controller('auth/telegram')
export class TelegramBotController {
  constructor(
    private readonly telegram: TelegramBotService,
    private readonly audit: AuditService,
  ) {}

  // POST /api/auth/telegram/start — session may be anonymous or authenticated;
  // purpose (LOGIN vs LINK) is derived server-side from the session, never from the client.
  @ApiOperation({ summary: 'Tạo yêu cầu đăng nhập/link qua Telegram, trả về code + deep link' })
  @ApiResponse({ status: 201, description: 'Tạo request thành công' })
  @UseGuards(ThrottlerGuard, CsrfGuard)
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
  @ApiOperation({ summary: 'Poll trạng thái một request đăng nhập/link Telegram theo code' })
  @ApiParam({ name: 'code', description: 'Code sinh ra từ POST /auth/telegram/start' })
  @ApiResponse({ status: 200, description: 'PENDING | CONFIRMED | CLAIMED | REJECTED | EXPIRED' })
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
}
