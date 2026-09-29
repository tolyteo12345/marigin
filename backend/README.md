# backend (user-authentication)

NestJS + Prisma backend for the `user-authentication` feature. See `architecture/user-authentication.md` at the repo root for the full design.

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
   The default `DATABASE_URL` in `.env.example` already matches `docker-compose.yml` credentials (`user` / `password` / `margin_trading` on `localhost:5432`) — no edit needed for local Postgres. You still need a real `TELEGRAM_BOT_TOKEN` / `TELEGRAM_WEBHOOK_SECRET_TOKEN` to exercise the Telegram flow end-to-end.
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
Runs unit tests against a mocked `PrismaService` (`jest-mock-extended`) — no database required. Integration tests against a real Postgres instance are not yet written (see `features/user-authentication/implementation.md` for remaining work).

## Stopping Postgres

```
npm run db:down
```
Data persists in the named Docker volume `margin_trading_postgres_data` between restarts; it is only removed with `docker compose down -v`.
