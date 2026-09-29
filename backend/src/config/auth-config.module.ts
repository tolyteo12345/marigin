import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthConfigService } from './auth-config.service';

// Global so every feature module (session-store, local-credential,
// telegram-bot, ...) can inject AuthConfigService without re-importing.
@Global()
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  providers: [AuthConfigService],
  exports: [AuthConfigService],
})
export class AuthConfigModule {}
