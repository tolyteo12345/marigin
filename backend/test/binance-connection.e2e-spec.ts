import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TelegramBotService } from '../src/telegram-bot/telegram-bot.service';
import { BinanceReadOnlyAdapterService } from '../src/binance-adapter/binance-read-only-adapter.service';
import { BinanceAdapterResult, CrossMarginAccountResponse, ApiKeyRestrictionsResponse } from '../src/binance-adapter/binance-api.types';

class TelegramBotServiceStub {
  onModuleInit(): void {}
  onModuleDestroy(): void {}
}

function marginAccountFixture(overrides: Partial<CrossMarginAccountResponse> = {}): CrossMarginAccountResponse {
  return {
    accountType: 'MARGIN_1',
    created: true,
    borrowEnabled: true,
    marginLevel: '999.00000000',
    collateralMarginLevel: '999.00000000',
    totalAssetOfBtc: '1.50000000',
    totalLiabilityOfBtc: '0.10000000',
    totalNetAssetOfBtc: '1.40000000',
    totalCollateralValueInUSDT: '50000.00',
    tradeEnabled: true,
    transferInEnabled: true,
    transferOutEnabled: true,
    userAssets: [{ asset: 'USDT', borrowed: '0.00000000', free: '100.00000000', interest: '0.00000000', locked: '0.00000000', netAsset: '100.00000000' }],
    ...overrides,
  };
}

function restrictionsFixture(overrides: Partial<ApiKeyRestrictionsResponse> = {}): ApiKeyRestrictionsResponse {
  return {
    ipRestrict: false,
    enableReading: true,
    enableMargin: true,
    enableSpotAndMarginTrading: false,
    enableWithdrawals: false,
    enableInternalTransfer: false,
    enableFutures: false,
    enableVanillaOptions: false,
    enablePortfolioMarginTrading: false,
    ...overrides,
  };
}

// Requires a real Postgres reachable at DATABASE_URL (see backend/README.md),
// same disposable margin_trading_test database as auth.e2e-spec.ts. Binance
// itself is mocked (BinanceReadOnlyAdapterService override) — there is no
// Margin sandbox to call for real (RISK-001) — this suite verifies the app's
// own logic (session/CSRF/ownership/state machine/DB persistence) end-to-end
// against real Postgres, not Binance's actual API behavior.
describe('Binance read-only connection flows (e2e, real Postgres, mocked Binance)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adapter: jest.Mocked<Pick<BinanceReadOnlyAdapterService, 'getCrossMarginAccount' | 'getApiKeyRestrictions'>>;

  beforeAll(async () => {
    adapter = {
      getCrossMarginAccount: jest.fn(),
      getApiKeyRestrictions: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TelegramBotService)
      .useClass(TelegramBotServiceStub)
      .overrideProvider(BinanceReadOnlyAdapterService)
      .useValue(adapter)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    jest.spyOn(ThrottlerGuard.prototype, 'canActivate').mockResolvedValue(true);

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await prisma.connectionAuditLog.deleteMany();
    await prisma.binanceConnection.deleteMany();
    await prisma.telegramLoginRequest.deleteMany();
    await prisma.session.deleteMany();
    await prisma.localCredential.deleteMany();
    await prisma.telegramIdentity.deleteMany();
    await prisma.user.deleteMany();
  });

  function agent() {
    return request.agent(app.getHttpServer());
  }

  async function loginAsNewUser(email: string): Promise<ReturnType<typeof agent>> {
    const a = agent();
    const csrfRes = await a.get('/api/auth/csrf-token');
    await a
      .post('/api/auth/register')
      .set('x-csrf-token', csrfRes.body.csrfToken)
      .send({ email, password: 'correct horse battery' })
      .expect(200);
    return a;
  }

  async function csrf(a: ReturnType<typeof agent>): Promise<string> {
    const res = await a.get('/api/auth/csrf-token').expect(200);
    return res.body.csrfToken as string;
  }

  it('AC-001: create + synchronous verify -> VERIFIED with a permission snapshot, secret never in the response', async () => {
    const a = await loginAsNewUser('alice@example.com');
    adapter.getCrossMarginAccount.mockResolvedValueOnce({ ok: true, data: marginAccountFixture() });
    adapter.getApiKeyRestrictions.mockResolvedValueOnce({ ok: true, data: restrictionsFixture() });

    const csrfToken = await csrf(a);
    const res = await a
      .post('/api/binance-connections')
      .set('x-csrf-token', csrfToken)
      .send({ label: 'Main', apiKey: 'my-api-key', apiSecret: 'my-api-secret' })
      .expect(201);

    expect(res.body.status).toBe('VERIFIED');
    expect(res.body.accountType).toBe('MARGIN_1');
    expect(res.body.permissionUnknown).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain('my-api-key');
    expect(JSON.stringify(res.body)).not.toContain('my-api-secret');

    // Also never in the DB in plaintext.
    const row = await prisma.binanceConnection.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row.encryptedApiKey.toString('utf8')).not.toContain('my-api-key');
    expect(row.encryptedApiSecret.toString('utf8')).not.toContain('my-api-secret');
  });

  it('AC-003a: accountType=MARGIN_2 -> UNSUPPORTED_ACCOUNT_MODE with the Pro message', async () => {
    const a = await loginAsNewUser('bob@example.com');
    adapter.getCrossMarginAccount.mockResolvedValueOnce({ ok: true, data: marginAccountFixture({ accountType: 'MARGIN_2' }) });

    const csrfToken = await csrf(a);
    const res = await a
      .post('/api/binance-connections')
      .set('x-csrf-token', csrfToken)
      .send({ label: 'Pro account', apiKey: 'key', apiSecret: 'secret' })
      .expect(201);

    expect(res.body.status).toBe('UNSUPPORTED_ACCOUNT_MODE');
    expect(res.body.lastError).toContain('Cross Margin Pro');
  });

  it('AC-002: invalid signature -> INVALID', async () => {
    const a = await loginAsNewUser('carol@example.com');
    adapter.getCrossMarginAccount.mockResolvedValueOnce({ ok: false, kind: 'HTTP_ERROR', httpStatus: 401, binanceCode: -1022, message: 'bad signature' });

    const csrfToken = await csrf(a);
    const res = await a
      .post('/api/binance-connections')
      .set('x-csrf-token', csrfToken)
      .send({ label: 'Bad key', apiKey: 'key', apiSecret: 'secret' })
      .expect(201);

    expect(res.body.status).toBe('INVALID');
  });

  it('AC-006/IDOR: user B cannot read, verify, snapshot, or revoke user A\'s connection (404 either way)', async () => {
    const a = await loginAsNewUser('dave@example.com');
    adapter.getCrossMarginAccount.mockResolvedValueOnce({ ok: true, data: marginAccountFixture() });
    adapter.getApiKeyRestrictions.mockResolvedValueOnce({ ok: true, data: restrictionsFixture() });
    const csrfTokenA = await csrf(a);
    const created = await a
      .post('/api/binance-connections')
      .set('x-csrf-token', csrfTokenA)
      .send({ label: 'A only', apiKey: 'key', apiSecret: 'secret' })
      .expect(201);

    const b = await loginAsNewUser('erin@example.com');
    await b.get(`/api/binance-connections/${created.body.id}`).expect(404);
    const csrfTokenB1 = await csrf(b);
    await b.post(`/api/binance-connections/${created.body.id}/verify`).set('x-csrf-token', csrfTokenB1).expect(404);
    await b.get(`/api/binance-connections/${created.body.id}/account-snapshot`).expect(404);
    const csrfTokenB2 = await csrf(b);
    await b.delete(`/api/binance-connections/${created.body.id}`).set('x-csrf-token', csrfTokenB2).expect(404);

    // A can still see it — proves the 404 above was ownership, not the row missing.
    await a.get(`/api/binance-connections/${created.body.id}`).expect(200);
  });

  it('AC-007: revoke nulls the secret and removes the connection from the list; account-snapshot then 404s', async () => {
    const a = await loginAsNewUser('frank@example.com');
    adapter.getCrossMarginAccount.mockResolvedValueOnce({ ok: true, data: marginAccountFixture() });
    adapter.getApiKeyRestrictions.mockResolvedValueOnce({ ok: true, data: restrictionsFixture() });
    const csrfTokenCreate = await csrf(a);
    const created = await a
      .post('/api/binance-connections')
      .set('x-csrf-token', csrfTokenCreate)
      .send({ label: 'To revoke', apiKey: 'key', apiSecret: 'secret' })
      .expect(201);

    const csrfTokenDelete = await csrf(a);
    await a.delete(`/api/binance-connections/${created.body.id}`).set('x-csrf-token', csrfTokenDelete).expect(200, { ok: true });

    const list = await a.get('/api/binance-connections').expect(200);
    expect(list.body.find((c: { id: string }) => c.id === created.body.id)).toBeUndefined();

    await a.get(`/api/binance-connections/${created.body.id}/account-snapshot`).expect(404);

    const row = await prisma.binanceConnection.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(row.encryptedApiKey.length).toBe(0);
    expect(row.encryptedApiSecret.length).toBe(0);
  });

  it('AC-005/AC-008: account-snapshot returns fresh data each call, and surfaces a 429 with retryAfterSeconds on rate limit', async () => {
    const a = await loginAsNewUser('grace@example.com');
    adapter.getCrossMarginAccount.mockResolvedValueOnce({ ok: true, data: marginAccountFixture() });
    adapter.getApiKeyRestrictions.mockResolvedValueOnce({ ok: true, data: restrictionsFixture() });
    const csrfToken = await csrf(a);
    const created = await a
      .post('/api/binance-connections')
      .set('x-csrf-token', csrfToken)
      .send({ label: 'Snapshot test', apiKey: 'key', apiSecret: 'secret' })
      .expect(201);
    expect(created.body.status).toBe('VERIFIED');

    adapter.getCrossMarginAccount.mockResolvedValueOnce({ ok: true, data: marginAccountFixture({ marginLevel: '5.00000000' }) });
    const snap1 = await a.get(`/api/binance-connections/${created.body.id}/account-snapshot`).expect(200);
    expect(snap1.body.marginLevel).toBe('5.00000000');
    expect(typeof snap1.body.fetchedAt).toBe('string');

    adapter.getCrossMarginAccount.mockResolvedValueOnce({ ok: false, kind: 'HTTP_ERROR', httpStatus: 429, message: 'rate limited', retryAfterSeconds: 17 });
    const snap2 = await a.get(`/api/binance-connections/${created.body.id}/account-snapshot`).expect(429);
    expect(snap2.body.retryAfterSeconds).toBe(17);
  });

  it('POST /api/binance-connections without CSRF token is rejected (403)', async () => {
    const a = await loginAsNewUser('henry@example.com');
    await a.post('/api/binance-connections').send({ label: 'x', apiKey: 'k', apiSecret: 's' }).expect(403);
  });

  it('every endpoint requires an authenticated session (401 when anonymous)', async () => {
    const anon = agent();
    await anon.get('/api/binance-connections').expect(401);
    await anon.get('/api/binance-connections/does-not-matter').expect(401);
  });
});
