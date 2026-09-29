import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

// Global by-IP guard for /api/auth/* (login/register/telegram/start per
// architecture doc). POST /api/auth/telegram/webhook opts out via
// @SkipThrottle() since its caller is always Telegram infrastructure, not
// an end-user browser — see architecture "Rate limit" section.
// Default 10 req/min/IP is an engineering tuning value, not the account
// lockout threshold (that is BR-010, enforced separately in LocalCredentialModule).
@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 10,
      },
    ]),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class RateLimitModule {}
