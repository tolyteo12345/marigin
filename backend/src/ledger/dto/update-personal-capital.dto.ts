import { ApiProperty } from '@nestjs/swagger';
import { IsDecimalString } from '../decimal-string';

export class UpdatePersonalCapitalDto {
  @ApiProperty({ example: '20000.00', description: 'Tổng vốn cá nhân user tự xác nhận (USDT) — không suy từ balance Binance' })
  @IsDecimalString()
  amountUsdt!: string;
}
