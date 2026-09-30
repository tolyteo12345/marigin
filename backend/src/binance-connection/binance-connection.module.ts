import { Module } from '@nestjs/common';
import { SecretVaultModule } from '../secret-vault/secret-vault.module';
import { BinanceReadOnlyAdapterModule } from '../binance-adapter/binance-read-only-adapter.module';
import { ConnectionAuditModule } from '../connection-audit/connection-audit.module';
import { SessionStoreModule } from '../session-store/session-store.module';
import { CsrfModule } from '../csrf/csrf.module';
import { BinanceConnectionService } from './binance-connection.service';
import { BinanceConnectionController } from './binance-connection.controller';

@Module({
  imports: [SecretVaultModule, BinanceReadOnlyAdapterModule, ConnectionAuditModule, SessionStoreModule, CsrfModule],
  controllers: [BinanceConnectionController],
  providers: [BinanceConnectionService],
  exports: [BinanceConnectionService],
})
export class BinanceConnectionModule {}
