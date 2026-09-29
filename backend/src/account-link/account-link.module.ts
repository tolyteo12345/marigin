import { Module } from '@nestjs/common';
import { AccountLinkService } from './account-link.service';
import { AccountLinkController } from './account-link.controller';
import { LocalCredentialModule } from '../local-credential/local-credential.module';
import { AuditModule } from '../audit/audit.module';
import { CsrfModule } from '../csrf/csrf.module';

@Module({
  imports: [LocalCredentialModule, AuditModule, CsrfModule],
  controllers: [AccountLinkController],
  providers: [AccountLinkService],
})
export class AccountLinkModule {}
