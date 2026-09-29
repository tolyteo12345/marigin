import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Request, Response } from 'express';
import { CsrfService } from './csrf.service';

// Wraps csrf-sync's Express middleware as a Nest guard so it can be applied
// per-route with @UseGuards(CsrfGuard) (AC-010).
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly csrf: CsrfService) {}

  canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    return new Promise((resolve, reject) => {
      this.csrf.protectionMiddleware(req, res, (err?: unknown) => {
        if (err) {
          reject(new ForbiddenException('invalid csrf token'));
          return;
        }
        resolve(true);
      });
    });
  }
}
