import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthConfigModule } from './config/auth-config.module';
import { SessionStoreModule } from './session-store/session-store.module';
import { CsrfModule } from './csrf/csrf.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';
import { LocalCredentialModule } from './local-credential/local-credential.module';
import { TelegramBotModule } from './telegram-bot/telegram-bot.module';
import { AccountLinkModule } from './account-link/account-link.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    AuthConfigModule,
    PrismaModule,
    SessionStoreModule,
    CsrfModule,
    RateLimitModule,
    AuditModule,
    LocalCredentialModule,
    TelegramBotModule,
    AccountLinkModule,
    AuthModule,
  ],
})
export class AppModule {}
