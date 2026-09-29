import { Injectable, NestMiddleware } from '@nestjs/common';
import session from 'express-session';
import { Request, Response, NextFunction, RequestHandler } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuthConfigService } from '../config/auth-config.service';
import { PrismaSessionStore } from './prisma-session.store';
import { SESSION_ROLLING_MAX_AGE_MS } from '../common/constants';
import './session.types';

@Injectable()
export class SessionMiddleware implements NestMiddleware {
  private readonly handler: RequestHandler;

  constructor(prisma: PrismaService, config: AuthConfigService) {
    this.handler = session({
      store: new PrismaSessionStore(prisma),
      secret: config.sessionSecret,
      resave: false,
      // Avoid persisting a Session row for every anonymous visitor that
      // never writes to the session (e.g. never fetches a CSRF token).
      saveUninitialized: false,
      rolling: true,
      name: 'sid',
      cookie: {
        httpOnly: true,
        secure: config.isProduction,
        sameSite: 'lax',
        maxAge: SESSION_ROLLING_MAX_AGE_MS,
      },
    });
  }

  use(req: Request, res: Response, next: NextFunction): void {
    this.handler(req, res, next);
  }
}
