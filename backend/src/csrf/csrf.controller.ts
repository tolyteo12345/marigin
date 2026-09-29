import { Controller, Get, Req } from '@nestjs/common';
import { Request } from 'express';
import { CsrfService } from './csrf.service';

@Controller('auth')
export class CsrfController {
  constructor(private readonly csrf: CsrfService) {}

  // GET /api/auth/csrf-token — works for an anonymous session too; express-session's
  // saveUninitialized:false means the session row is only persisted once this
  // (or login) actually writes something into req.session.
  @Get('csrf-token')
  getToken(@Req() req: Request): { csrfToken: string } {
    return { csrfToken: this.csrf.generateToken(req) };
  }
}
