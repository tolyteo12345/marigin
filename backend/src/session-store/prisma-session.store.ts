import { Store } from 'express-session';
import type { SessionData } from 'express-session';
import { PrismaService } from '../prisma/prisma.service';

// Custom express-session Store backed by Prisma/Postgres (COND-A02 resolved).
// Deliberately hand-written instead of a small community package for this
// simple 3-column schema — see prisma/schema.prisma comment on model Session.
export class PrismaSessionStore extends Store {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private defaultExpiresAt(session: SessionData): Date {
    const expires = session.cookie?.expires;
    if (expires) {
      return new Date(expires);
    }
    // express-session cookies without an explicit expiry are session-only;
    // fall back to a conservative 1 day so rows do not linger forever.
    return new Date(Date.now() + 24 * 60 * 60 * 1000);
  }

  get(sid: string, callback: (err: unknown, session?: SessionData | null) => void): void {
    this.prisma.session
      .findUnique({ where: { sid } })
      .then((record) => {
        if (!record) {
          callback(null, null);
          return;
        }
        if (record.expiresAt.getTime() <= Date.now()) {
          // Lazily clean up expired rows on read, mirrors the lazy-expiry
          // pattern used for TelegramLoginRequest (no cron in MVP).
          this.destroy(sid, () => callback(null, null));
          return;
        }
        try {
          callback(null, JSON.parse(record.data) as SessionData);
        } catch (err) {
          callback(err);
        }
      })
      .catch((err) => callback(err));
  }

  set(sid: string, session: SessionData, callback?: (err?: unknown) => void): void {
    const expiresAt = this.defaultExpiresAt(session);
    const data = JSON.stringify(session);
    this.prisma.session
      .upsert({
        where: { sid },
        create: { sid, data, expiresAt },
        update: { data, expiresAt },
      })
      .then(() => callback?.())
      .catch((err) => callback?.(err));
  }

  destroy(sid: string, callback?: (err?: unknown) => void): void {
    // deleteMany instead of delete: does not throw if the row is already gone
    // (e.g. double logout, or expired row cleaned up concurrently).
    this.prisma.session
      .deleteMany({ where: { sid } })
      .then(() => callback?.())
      .catch((err) => callback?.(err));
  }

  touch(sid: string, session: SessionData, callback?: (err?: unknown) => void): void {
    const expiresAt = this.defaultExpiresAt(session);
    this.prisma.session
      .updateMany({ where: { sid }, data: { expiresAt } })
      .then(() => callback?.())
      .catch((err) => callback?.(err));
  }
}
