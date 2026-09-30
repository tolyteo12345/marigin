# backend (user-authentication + binance-read-only-connection)

NestJS + Prisma backend for the `user-authentication` and `binance-read-only-connection` features. See `architecture/user-authentication.md` and `architecture/binance-read-only-connection.md` at the repo root for the full design.

## Local setup

1. Start Docker Desktop (must be running before the next step).
2. Start Postgres:
   ```
   npm run db:up
   ```
3. Copy env file and fill in real secrets (never commit `.env`):
   ```
   cp .env.example .env
   ```
   The default `DATABASE_URL` in `.env.example` already matches `docker-compose.yml` credentials (`user` / `password` / `margin_trading` on `localhost:5432`) — no edit needed for local Postgres. You still need a real `TELEGRAM_BOT_TOKEN` (from BotFather) to exercise the Telegram flow end-to-end — no webhook URL/domain needed, the backend receives `/start <code>` via long-polling. You also need a real `BINANCE_SECRET_ENCRYPTION_KEY` (see generation command in `.env.example`) before any `binance-read-only-connection` endpoint will work — it fails fast with a clear error otherwise.
4. Apply the migration (schema not yet applied to any real database):
   ```
   npm run prisma:migrate:deploy
   ```
5. Generate the Prisma client (also runs automatically on `npm install` via Prisma's postinstall hook in most setups, but run explicitly if needed):
   ```
   npm run prisma:generate
   ```
6. Run the server:
   ```
   npm run start:dev
   ```

## Tests

```
npm test
```
Runs unit tests against a mocked `PrismaService` (`jest-mock-extended`) — no database required.

```
docker exec margin-trading-auth-postgres psql -U user -d margin_trading -c "CREATE DATABASE margin_trading_test"   # once
DATABASE_URL='postgresql://user:password@localhost:5432/margin_trading_test?schema=public' npx prisma migrate deploy  # once, or after new migrations
DATABASE_URL='postgresql://user:password@localhost:5432/margin_trading_test?schema=public' BINANCE_SECRET_ENCRYPTION_KEY='<same base64 32-byte key as .env>' npm run test:e2e
```
Runs `test/auth.e2e-spec.ts` and `test/binance-connection.e2e-spec.ts` (Supertest) against a real Postgres — register/login/logout/me/account-link/CSRF/session-isolation flows, plus add/verify/list/account-snapshot/revoke/ownership flows for Binance connections. Uses a disposable `margin_trading_test` database on the same container (never point this at `margin_trading`, both suites truncate their tables between test cases). `npm run test:e2e` always runs with `--runInBand`: the 2 spec files intentionally share one database and each does its own full-table cleanup in `beforeEach`, so running them in parallel workers causes cross-file races (observed directly while writing this suite — parallel runs produced spurious 500s and `ECONNREFUSED`). `TelegramBotService` is stubbed out in both suites (no live Bot API calls); Telegram claim/confirm logic has its own unit coverage in `test/telegram-bot.service.spec.ts`. `BinanceReadOnlyAdapterService` is stubbed out in the binance suite (no live Binance API calls — no Margin sandbox exists, see RISK-001 in `analysis/binance-read-only-connection-feasibility.md`); adapter HTTP/error-mapping logic has its own unit coverage in `test/binance-read-only-adapter.service.spec.ts`.

## Stopping Postgres

```
npm run db:down
```
Data persists in the named Docker volume `margin_trading_postgres_data` between restarts; it is only removed with `docker compose down -v`.
