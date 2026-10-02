import { Prisma } from '@prisma/client';

// Postgres raises a plain unique_violation (23505) for the hand-written
// partial unique index (BorrowPosition_user_asset_open_unique) exactly like
// it does for a Prisma-declared @@unique — Prisma maps both to P2002. `hint`
// disambiguates which constraint fired when a transaction could violate more
// than one (e.g. BorrowPosition's partial index vs LedgerEvent's idempotency
// key), by checking it against whatever Postgres/Prisma surfaced in
// meta.target or the raw message.
export function isUniqueViolation(err: unknown, hint?: string): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') {
    return false;
  }
  if (!hint) {
    return true;
  }
  const target = (err.meta as { target?: unknown })?.target;
  const text = Array.isArray(target) ? target.join(',') : String(target ?? '');
  return text.includes(hint) || err.message.includes(hint);
}
