import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TelegramBotService } from '../src/telegram-bot/telegram-bot.service';

class TelegramBotServiceStub {
  onModuleInit(): void {}
  onModuleDestroy(): void {}
}

// Regression suite for a real bug reported from the running app: GET
// /api/auth/me started returning 429 after only a couple of page loads
// (React mounts it from both App.tsx and AccountLinkPanel.tsx, plus
// StrictMode double-invokes effects in dev). Root cause: ThrottlerGuard was
// registered as a global APP_GUARD (rate-limit.module.ts), so it counted
// EVERY request in the app — including read-only session checks and the
// ~2s Telegram status poll — against the same 10 req/min/IP budget meant
// only for login/register/telegram-start (architecture doc "Rate limit").
// This suite intentionally does NOT patch ThrottlerGuard — it exists
// specifically to prove the real guard behaves correctly now.
describe('Rate limiting scope (e2e, real Postgres, real ThrottlerGuard)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TelegramBotService)
      .useClass(TelegramBotServiceStub)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.session.deleteMany();
    await prisma.localCredential.deleteMany();
    await prisma.user.deleteMany();
  });

  function agent() {
    return request.agent(app.getHttpServer());
  }

  it('GET /api/auth/me is never throttled, even after far more than 10 requests/min (the reported bug)', async () => {
    const a = agent();
    for (let i = 0; i < 15; i += 1) {
      // Anonymous is fine here — asserting only that the guard never kicks
      // in (401 is the correct "not logged in" answer, 429 would be the bug).
      await a.get('/api/auth/me').expect(401);
    }
  });

  it('GET /api/auth/csrf-token is never throttled (needed once per mutating request, incl. Telegram status polling context)', async () => {
    const a = agent();
    for (let i = 0; i < 15; i += 1) {
      await a.get('/api/auth/csrf-token').expect(200);
    }
  });

  it('POST /api/auth/login is still throttled after 10 requests/min/IP (the actual intended target)', async () => {
    const a = agent();
    const csrfToken = (await a.get('/api/auth/csrf-token').expect(200)).body.csrfToken as string;

    let sawThrottled = false;
    for (let i = 0; i < 15; i += 1) {
      const res = await a
        .post('/api/auth/login')
        .set('x-csrf-token', csrfToken)
        .send({ email: 'nobody@example.com', password: 'wrong password' });
      if (res.status === 429) {
        sawThrottled = true;
        break;
      }
      expect(res.status).toBe(401);
    }
    expect(sawThrottled).toBe(true);
  });
});
