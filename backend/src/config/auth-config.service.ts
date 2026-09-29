import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Centralizes reading auth-related env vars so no module hardcodes defaults
// or re-parses env vars independently (BR-010/BR-011, AGENTS.md no-hardcode-secret rule).
@Injectable()
export class AuthConfigService {
  constructor(private readonly config: ConfigService) {}

  get loginMaxAttempts(): number {
    return Number(this.config.get<string>('AUTH_LOGIN_MAX_ATTEMPTS', '5'));
  }

  get loginLockoutMinutes(): number {
    return Number(this.config.get<string>('AUTH_LOGIN_LOCKOUT_MINUTES', '15'));
  }

  get sessionSecret(): string {
    const secret = this.config.get<string>('SESSION_SECRET');
    if (!secret) {
      throw new Error('SESSION_SECRET env var is required');
    }
    return secret;
  }

  get telegramBotToken(): string {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN env var is required');
    }
    return token;
  }

  get telegramBotUsername(): string {
    const username = this.config.get<string>('TELEGRAM_BOT_USERNAME');
    if (!username) {
      throw new Error('TELEGRAM_BOT_USERNAME env var is required');
    }
    return username;
  }

  get telegramWebhookSecretToken(): string {
    const secret = this.config.get<string>('TELEGRAM_WEBHOOK_SECRET_TOKEN');
    if (!secret) {
      throw new Error('TELEGRAM_WEBHOOK_SECRET_TOKEN env var is required');
    }
    return secret;
  }

  get telegramWebhookUrl(): string {
    const url = this.config.get<string>('TELEGRAM_WEBHOOK_URL');
    if (!url) {
      throw new Error('TELEGRAM_WEBHOOK_URL env var is required');
    }
    return url;
  }

  get isProduction(): boolean {
    return this.config.get<string>('NODE_ENV') === 'production';
  }
}
