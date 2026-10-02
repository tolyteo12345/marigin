import { ApiProperty } from '@nestjs/swagger';
import { IsDecimalString } from '../decimal-string';

export class SellAssetDto {
  @ApiProperty({ example: '25.1', description: 'Số lượng borrowedAsset đã bán' })
  @IsDecimalString()
  quantitySold!: string;

  @ApiProperty({ example: '10542.00', description: 'USDT thực nhận sau phí (không phải giá niêm yết)' })
  @IsDecimalString()
  proceedsUsdt!: string;
}
