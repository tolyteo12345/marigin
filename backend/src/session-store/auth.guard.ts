import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { SESSION_ABSOLUTE_CAP_MS } from '../common/constants';
import './session.types';

// Reads req.session.userId (server-side, never client input) and exposes it
// as req.user.id — the contract binance-read-only-connection depends on.
@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const userId = req.session?.userId;
    const loginAt = req.session?.loginAt;

    if (!userId || !loginAt) {
      throw new UnauthorizedException();
    }

    // Absolute cap (BR-011): express-session's rolling cookie alone cannot
    // enforce this, so we track loginAt ourselves and reject past 30 days
    // even if the rolling cookie is still technically valid.
    if (Date.now() - loginAt > SESSION_ABSOLUTE_CAP_MS) {
      req.session.destroy(() => undefined);
      throw new UnauthorizedException('session expired');
    }

    // Never trust a userId supplied by the client body/query — always the
    // server-issued session value.
    (req as Request & { user: { id: string } }).user = { id: userId };
    return true;
  }
}
