import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { TelegramBotService } from './telegram-bot/telegram-bot.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Required for secure cookies to work correctly behind a reverse proxy in
  // production (architecture doc "Session cookie" note, EV-004).
  app.set('trust proxy', 1);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Registers TELEGRAM_WEBHOOK_URL + secret token with Telegram at startup
  // (architecture doc: TelegramBotModule "setWebhook lúc bootstrap"). Failure
  // here is logged, not fatal, so the app can still start in environments
  // without a real bot configured (e.g. running unit tests / local dev).
  try {
    await app.get(TelegramBotService).setWebhook();
  } catch (err) {
    Logger.warn(`Telegram setWebhook failed at bootstrap: ${(err as Error).message}`, 'Bootstrap');
  }

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
}

bootstrap();
