import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { SessionData } from 'express-session';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrismaSessionStore } from '../src/session-store/prisma-session.store';

describe('PrismaSessionStore (custom express-session Store, COND-A02)', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let store: PrismaSessionStore;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    store = new PrismaSessionStore(prisma);
  });

  it('get() returns null for a non-existent sid', (done) => {
    prisma.session.findUnique.mockResolvedValueOnce(null);
    store.get('missing-sid', (err, session) => {
      expect(err).toBeNull();
      expect(session).toBeNull();
      done();
    });
  });

  it('get() lazily destroys and returns null for an expired session row', (done) => {
    prisma.session.findUnique.mockResolvedValueOnce({
      sid: 'sid-1',
      data: JSON.stringify({ userId: 'u1' }),
      expiresAt: new Date(Date.now() - 1000),
    } as never);
    prisma.session.deleteMany.mockResolvedValueOnce({ count: 1 });

    store.get('sid-1', (err, session) => {
      expect(err).toBeNull();
      expect(session).toBeNull();
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { sid: 'sid-1' } });
      done();
    });
  });

  it('get() parses and returns the stored session payload when not expired', (done) => {
    prisma.session.findUnique.mockResolvedValueOnce({
      sid: 'sid-1',
      data: JSON.stringify({ userId: 'u1', loginAt: 123 }),
      expiresAt: new Date(Date.now() + 60_000),
    } as never);

    store.get('sid-1', (err, session) => {
      expect(err).toBeNull();
      expect(session).toEqual({ userId: 'u1', loginAt: 123 });
      done();
    });
  });

  it('set() upserts the row using cookie.expires as expiresAt', (done) => {
    prisma.session.upsert.mockResolvedValueOnce({} as never);
    const expires = new Date(Date.now() + 3600_000);
    const session = { cookie: { expires } } as unknown as SessionData;

    store.set('sid-1', session, (err) => {
      expect(err).toBeUndefined();
      expect(prisma.session.upsert).toHaveBeenCalledWith({
        where: { sid: 'sid-1' },
        create: { sid: 'sid-1', data: JSON.stringify(session), expiresAt: expires },
        update: { data: JSON.stringify(session), expiresAt: expires },
      });
      done();
    });
  });

  it('destroy() deletes the row without throwing if already gone', (done) => {
    prisma.session.deleteMany.mockResolvedValueOnce({ count: 0 });
    store.destroy('sid-1', (err) => {
      expect(err).toBeUndefined();
      done();
    });
  });

  it('touch() extends expiresAt for the rolling session', (done) => {
    prisma.session.updateMany.mockResolvedValueOnce({ count: 1 });
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const session = { cookie: { expires } } as unknown as SessionData;

    store.touch('sid-1', session, (err) => {
      expect(err).toBeUndefined();
      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: { sid: 'sid-1' },
        data: { expiresAt: expires },
      });
      done();
    });
  });
});
