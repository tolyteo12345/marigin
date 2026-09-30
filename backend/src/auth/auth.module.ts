import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { LocalCredentialModule } from '../local-credential/local-credential.module';
import { TelegramBotModule } from '../telegram-bot/telegram-bot.module';
import { SessionStoreModule } from '../session-store/session-store.module';
import { AuditModule } from '../audit/audit.module';
import { CsrfModule } from '../csrf/csrf.module';
import { RateLimitModule } from '../rate-limit/rate-limit.module';

@Module({
  imports: [LocalCredentialModule, TelegramBotModule, SessionStoreModule, AuditModule, CsrfModule, RateLimitModule],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
