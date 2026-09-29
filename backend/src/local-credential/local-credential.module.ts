import { Module } from '@nestjs/common';
import { LocalCredentialService } from './local-credential.service';

@Module({
  providers: [LocalCredentialService],
  exports: [LocalCredentialService],
})
export class LocalCredentialModule {}
