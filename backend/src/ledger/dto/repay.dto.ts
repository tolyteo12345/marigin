import { ApiProperty } from '@nestjs/swagger';
import { IsDecimalString } from '../decimal-string';

export class RepayDto {
  @ApiProperty({ example: '10000', description: 'Số lượng trả nợ, đơn vị borrowedAsset' })
  @IsDecimalString()
  amount!: string;
}
