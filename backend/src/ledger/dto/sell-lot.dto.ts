import { ApiProperty } from '@nestjs/swagger';
import { IsDecimalString } from '../decimal-string';

export class SellLotDto {
  @ApiProperty({ example: '0.075', description: 'Số lượng bán, phải <= remainingQuantity' })
  @IsDecimalString()
  quantitySold!: string;

  @ApiProperty({ example: '3500.00', description: 'USDT thực nhận sau phí' })
  @IsDecimalString()
  proceedsUsdt!: string;
}
