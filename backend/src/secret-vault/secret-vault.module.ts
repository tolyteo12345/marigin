import { Module } from '@nestjs/common';
import { SecretVaultService } from './secret-vault.service';

@Module({
  providers: [SecretVaultService],
  exports: [SecretVaultService],
})
export class SecretVaultModule {}
