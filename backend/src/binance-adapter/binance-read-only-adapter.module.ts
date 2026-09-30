import { Module } from '@nestjs/common';
import { BinanceReadOnlyAdapterService } from './binance-read-only-adapter.service';

@Module({
  providers: [BinanceReadOnlyAdapterService],
  exports: [BinanceReadOnlyAdapterService],
})
export class BinanceReadOnlyAdapterModule {}
