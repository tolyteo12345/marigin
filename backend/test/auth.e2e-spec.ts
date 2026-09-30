import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TelegramBotService } from '../src/telegram-bot/telegram-bot.service';

// Stub replaces the real TelegramBotService for this suite: the real one
// calls the live Telegram Bot API from onModuleInit() (deleteWebhook +
// long-polling loop), which must not run against a fake/absent bot token in
// CI. Telegram claim/confirm logic already has dedicated unit test coverage
// (test/telegram-bot.service.spec.ts, mocked Prisma) — this e2e suite only
// needs the local-credential + session + CSRF + ownership flows to run
// against a real Postgres.
class TelegramBotServiceStub {
  onModuleInit(): void {}
  onModuleDestroy(): void {}
}

// Requires a real Postgres reachable at DATABASE_URL (see backend/README.md,
// `npm run db:up`) with migrations applied — run with:
//   DATABASE_URL='postgresql://user:password@localhost:5432/margin_trading_test?schema=public' npm run test:e2e
// This suite truncates its own tables between tests; point it at a
// disposable database, never at a shared/dev one with real data.
describe('Auth flows (e2e, real Postgres)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TelegramBotService)
      .useClass(TelegramBotServiceStub)
      // Per-IP rate limiting (rate-limit.module.ts) is a real production
      // behavior, but this suite fires far more than 10 req/min from a
      // single "IP" (the supertest client) across unrelated test cases —
      // disabling it here keeps tests independent. The guard itself is
      // engineering tuning, not one of the ACs this suite verifies.
      .compile();

    // ThrottlerGuard is registered as a global APP_GUARD provider from
    // within RateLimitModule (not the root TestingModule), so
    // TestingModuleBuilder.overrideProvider(APP_GUARD) does not reach it —
    // Nest binds each APP_GUARD declaration to its own internal token.
    // Patching the prototype method is the reliable way to disable it for
    // this suite, which fires far more than 10 req/min from a single "IP"
    // across unrelated test cases; the guard itself is engineering tuning,
    // not one of the ACs this suite verifies.
    jest.spyOn(ThrottlerGuard.prototype, 'canActivate').mockResolvedValue(true);

    app = moduleRef.createNestApplication();
    // Mirror src/main.ts bootstrap (global prefix + validation pipe) so this
    // suite exercises the same request pipeline as the real server.
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.telegramLoginRequest.deleteMany();
    await prisma.session.deleteMany();
    await prisma.localCredential.deleteMany();
    await prisma.telegramIdentity.deleteMany();
    await prisma.user.deleteMany();
  });

  function agent() {
    return request.agent(app.getHttpServer());
  }

  async function getCsrfToken(a: ReturnType<typeof agent>): Promise<string> {
    const res = await a.get('/api/auth/csrf-token').expect(200);
    return res.body.csrfToken as string;
  }

  it('register -> me -> logout -> me(401) round-trips through the real DB (AC-001-ish happy path)', async () => {
    const a = agent();
    const csrfToken = await getCsrfToken(a);

    await a
      .post('/api/auth/register')
      .set('x-csrf-token', csrfToken)
      .send({ email: 'alice@example.com', password: 'correct horse battery' })
      .expect(200, { ok: true });

    const me = await a.get('/api/auth/me').expect(200);
    expect(me.body).toMatchObject({
      hasLocalCredential: true,
      hasTelegramIdentity: false,
    });
    expect(typeof me.body.userId).toBe('string');
    expect(me.body.localEmailMasked).not.toBe('alice@example.com'); // BR-004: never echo plaintext back

    const csrfAfterRegister = await getCsrfToken(a);
    await a.post('/api/auth/logout').set('x-csrf-token', csrfAfterRegister).expect(200, { ok: true });

    await a.get('/api/auth/me').expect(401);
  });

  it('rejects a 7-character password and accepts exactly 8 characters (BR-015 boundary)', async () => {
    const tooShort = agent();
    const csrf1 = await getCsrfToken(tooShort);
    await tooShort
      .post('/api/auth/register')
      .set('x-csrf-token', csrf1)
      .send({ email: 'short-pw@example.com', password: '1234567' })
      .expect(400);

    const exactlyEight = agent();
    const csrf2 = await getCsrfToken(exactlyEight);
    await exactlyEight
      .post('/api/auth/register')
      .set('x-csrf-token', csrf2)
      .send({ email: 'exact-pw@example.com', password: '12345678' })
      .expect(200, { ok: true });
  });

  it('duplicate register email -> 409, does not disturb the original account (AC-002)', async () => {
    const first = agent();
    const csrf1 = await getCsrfToken(first);
    await first
      .post('/api/auth/register')
      .set('x-csrf-token', csrf1)
      .send({ email: 'bob@example.com', password: 'correct horse battery' })
      .expect(200);

    const second = agent();
    const csrf2 = await getCsrfToken(second);
    await second
      .post('/api/auth/register')
      .set('x-csrf-token', csrf2)
      .send({ email: 'bob@example.com', password: 'another password entirely' })
      .expect(409);

    expect(await prisma.localCredential.count({ where: { email: 'bob@example.com' } })).toBe(1);
  });

  it('login with wrong password and login with unknown email return the identical generic 401 message (no account-existence leak)', async () => {
    const setup = agent();
    const csrf0 = await getCsrfToken(setup);
    await setup
      .post('/api/auth/register')
      .set('x-csrf-token', csrf0)
      .send({ email: 'carol@example.com', password: 'correct horse battery' })
      .expect(200);

    const wrongPassword = agent();
    const csrf1 = await getCsrfToken(wrongPassword);
    const res1 = await wrongPassword
      .post('/api/auth/login')
      .set('x-csrf-token', csrf1)
      .send({ email: 'carol@example.com', password: 'totally wrong password' })
      .expect(401);

    const unknownEmail = agent();
    const csrf2 = await getCsrfToken(unknownEmail);
    const res2 = await unknownEmail
      .post('/api/auth/login')
      .set('x-csrf-token', csrf2)
      .send({ email: 'nobody@example.com', password: 'whatever password' })
      .expect(401);

    expect(res1.body.message).toBe(res2.body.message);
  });

  it('locks the account after 5 failed attempts (BR-010/AC-004): correct password is rejected too once locked', async () => {
    const setup = agent();
    const csrfSetup = await getCsrfToken(setup);
    await setup
      .post('/api/auth/register')
      .set('x-csrf-token', csrfSetup)
      .send({ email: 'locked@example.com', password: 'the real password here' })
      .expect(200);
    const csrfAfterSetup = await getCsrfToken(setup);
    await setup.post('/api/auth/logout').set('x-csrf-token', csrfAfterSetup).expect(200);

    let lastMessage: string | undefined;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const a = agent();
      const csrf = await getCsrfToken(a);
      const res = await a
        .post('/api/auth/login')
        .set('x-csrf-token', csrf)
        .send({ email: 'locked@example.com', password: 'wrong password' })
        .expect(401);
      lastMessage = res.body.message;
    }

    // 6th attempt, now WITH the correct password — must still fail identically
    // because AUTH_LOGIN_MAX_ATTEMPTS=5 has locked the account (BR-010), and
    // the message must not differ from the wrong-password case (no lockout leak).
    const afterLockout = agent();
    const csrfFinal = await getCsrfToken(afterLockout);
    const finalRes = await afterLockout
      .post('/api/auth/login')
      .set('x-csrf-token', csrfFinal)
      .send({ email: 'locked@example.com', password: 'the real password here' })
      .expect(401);

    expect(finalRes.body.message).toBe(lastMessage);
  });

  it('login without a CSRF token is rejected (AC-010)', async () => {
    const a = agent();
    await getCsrfToken(a); // establishes the session cookie the guard needs to check against
    await a
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever password' })
      .expect(403);
  });

  it('POST /api/auth/link/local without an authenticated session is rejected (ownership boundary)', async () => {
    const a = agent();
    const csrf = await getCsrfToken(a);
    await a
      .post('/api/auth/link/local')
      .set('x-csrf-token', csrf)
      .send({ email: 'x@example.com', password: 'correct horse battery' })
      .expect(401);
  });

  it('two independently registered sessions never see each other\'s /me data (IDOR-style isolation, AC-006 spirit)', async () => {
    const sessionA = agent();
    const csrfA = await getCsrfToken(sessionA);
    await sessionA
      .post('/api/auth/register')
      .set('x-csrf-token', csrfA)
      .send({ email: 'dave@example.com', password: 'correct horse battery' })
      .expect(200);
    const meA = await sessionA.get('/api/auth/me').expect(200);

    const sessionB = agent();
    const csrfB = await getCsrfToken(sessionB);
    await sessionB
      .post('/api/auth/register')
      .set('x-csrf-token', csrfB)
      .send({ email: 'erin@example.com', password: 'correct horse battery' })
      .expect(200);
    const meB = await sessionB.get('/api/auth/me').expect(200);

    expect(meA.body.userId).not.toBe(meB.body.userId);

    // Session B was never issued session A's cookie, so it cannot read A's data
    // through any endpoint — /me only ever reflects req.session.userId, never a
    // client-supplied id.
    await sessionB.get('/api/auth/me').expect(200).expect((res) => {
      if (res.body.userId === meA.body.userId) {
        throw new Error('session B must not resolve to session A\'s userId');
      }
    });
  });
});
