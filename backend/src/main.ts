import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Needed so TelegramBotService.onModuleDestroy() actually runs on SIGTERM
  // and stops the long-polling loop (architecture doc "Long-polling loop"
  // step 5) instead of only firing on an explicit app.close().
  app.enableShutdownHooks();

  // Required for secure cookies to work correctly behind a reverse proxy in
  // production (architecture doc "Session cookie" note, EV-004).
  app.set('trust proxy', 1);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Swagger UI/JSON off in production: this documents internal contracts,
  // not something to expose publicly.
  if (process.env.NODE_ENV !== 'production') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Margin Trading API')
        .setDescription('API cho Crypto Borrow Decision Support & Position Management Platform')
        .setVersion('0.1.0')
        .addCookieAuth('sid')
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document);
  }

  // TelegramBotService.onModuleInit() handles deleteWebhook() + starting the
  // long-polling loop itself (architecture doc "Long-polling loop") — no
  // manual wiring needed here anymore.

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
}

bootstrap();
