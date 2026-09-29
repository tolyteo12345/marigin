import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '../src/session-store/auth.guard';

function makeContext(session: Record<string, unknown> | undefined) {
  const req: any = { session };
  const context = {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as unknown as ExecutionContext;
  return { req, context };
}

describe('AuthGuard (session TTL / absolute cap, BR-011)', () => {
  it('rejects when there is no session userId', () => {
    const { context } = makeContext({});
    const guard = new AuthGuard();
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('allows and sets req.user.id when session is within the 30-day absolute cap', () => {
    const now = Date.now();
    const { req, context } = makeContext({
      userId: 'user-1',
      loginAt: now - 1000,
      destroy: jest.fn(),
    });
    const guard = new AuthGuard();

    expect(guard.canActivate(context)).toBe(true);
    expect(req.user).toEqual({ id: 'user-1' });
  });

  it('rejects and destroys the session once 30 days have elapsed since loginAt, even if the rolling cookie is still valid', () => {
    const now = Date.now();
    const THIRTY_ONE_DAYS_MS = 31 * 24 * 60 * 60 * 1000;
    const destroy = jest.fn();
    const { context } = makeContext({
      userId: 'user-1',
      loginAt: now - THIRTY_ONE_DAYS_MS,
      destroy,
    });
    const guard = new AuthGuard();

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(destroy).toHaveBeenCalled();
  });

  it('never trusts a client-supplied userId — only the server-side session value ends up in req.user', () => {
    const now = Date.now();
    const { req, context } = makeContext({
      userId: 'user-from-session',
      loginAt: now - 1000,
      destroy: jest.fn(),
    });
    req.body = { userId: 'user-from-attacker-body' };
    const guard = new AuthGuard();

    guard.canActivate(context);

    expect(req.user).toEqual({ id: 'user-from-session' });
  });
});
