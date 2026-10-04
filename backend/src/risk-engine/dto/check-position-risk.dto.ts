import { ApiProperty } from '@nestjs/swagger';
import { IsDecimalString } from '../../ledger/decimal-string';

export class CheckPositionRiskDto {
  @ApiProperty({
    example: '65000',
    description: 'Giá hiện tại của borrowedAsset (USDT), user tự nhập mỗi lần kiểm tra — không lưu lại (BR-003)',
  })
  @IsDecimalString()
  currentPrice!: string;
}
