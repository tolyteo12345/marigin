import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';

// By-IP throttling config only — NOT registered as a global APP_GUARD.
// Architecture doc ("Rate limit" section) scopes this to exactly 3 endpoints:
// /api/auth/login, /api/auth/register, /api/auth/telegram/start. A global
// guard previously applied this to EVERY route in the app (including GET
// /api/auth/me, GET .../telegram/status/:code polled every ~2s, and all
// binance-connections routes) — confirmed as a real bug from browser console
// logs (429 on GET /api/auth/me after a couple of page loads/React
// StrictMode double-effects). Callers now opt in explicitly via
// `@UseGuards(ThrottlerGuard)` on just those 3 controller methods, so a new
// endpoint defaults to NOT throttled instead of silently inheriting this.
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
  exports: [ThrottlerModule],
})
export class RateLimitModule {}
