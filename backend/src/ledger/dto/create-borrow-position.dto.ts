import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { IsDecimalString } from '../decimal-string';

export class CreateBorrowPositionDto {
  @ApiProperty({ example: 'ZEC', description: 'Tài sản vay, free-form' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  borrowedAsset!: string;

  @ApiProperty({ example: '25.1', description: 'Số lượng vay, đơn vị borrowedAsset' })
  @IsDecimalString()
  quantity!: string;

  @ApiProperty({ example: '420.5', description: 'first_borrow_entry_price (USDT) — immutable sau khi tạo' })
  @IsDecimalString()
  firstBorrowEntryPrice!: string;
}
