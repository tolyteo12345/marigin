import { Injectable } from '@nestjs/common';
import { csrfSync } from 'csrf-sync';
import { Request } from 'express';

// Synchronizer Token Pattern via csrf-sync (COND-A01 resolved — csurf is
// deprecated/archived, not used). Default options already match the
// architecture doc: token stored in req.session.csrfToken, read from the
// `x-csrf-token` request header.
@Injectable()
export class CsrfService {
  private readonly instance = csrfSync();

  generateToken(req: Request): string {
    return this.instance.generateToken(req);
  }

  get protectionMiddleware() {
    return this.instance.csrfSynchronisedProtection;
  }
}
