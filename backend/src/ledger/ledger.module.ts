import { Module } from '@nestjs/common';
import { BinanceConnectionModule } from '../binance-connection/binance-connection.module';
import { CsrfModule } from '../csrf/csrf.module';
import { LedgerService } from './ledger.service';
import { LedgerController } from './ledger.controller';

@Module({
  imports: [BinanceConnectionModule, CsrfModule],
  controllers: [LedgerController],
  providers: [LedgerService],
  exports: [LedgerService],
})
export class LedgerModule {}
