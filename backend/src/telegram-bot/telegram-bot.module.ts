import { Module } from '@nestjs/common';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramBotController } from './telegram-bot.controller';
import { AuditModule } from '../audit/audit.module';
import { CsrfModule } from '../csrf/csrf.module';
import { RateLimitModule } from '../rate-limit/rate-limit.module';

@Module({
  imports: [AuditModule, CsrfModule, RateLimitModule],
  controllers: [TelegramBotController],
  providers: [TelegramBotService],
  exports: [TelegramBotService],
})
export class TelegramBotModule {}
