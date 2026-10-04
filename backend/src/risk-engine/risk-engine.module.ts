import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module';
import { BinanceConnectionModule } from '../binance-connection/binance-connection.module';
import { CsrfModule } from '../csrf/csrf.module';
import { RiskEngineService } from './risk-engine.service';
import { RiskEngineController } from './risk-engine.controller';

@Module({
  imports: [LedgerModule, BinanceConnectionModule, CsrfModule],
  controllers: [RiskEngineController],
  providers: [RiskEngineService],
})
export class RiskEngineModule {}
