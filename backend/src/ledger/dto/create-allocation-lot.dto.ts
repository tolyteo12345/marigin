import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AllocationAsset, AllocationFundingSource } from '@prisma/client';
import { IsDecimalString } from '../decimal-string';

export class CreateAllocationLotDto {
  @ApiProperty({ enum: AllocationAsset, description: 'Chỉ BTC | ETH — SOL không được hỗ trợ ở v1 (AC-009)' })
  @IsEnum(AllocationAsset)
  asset!: AllocationAsset;

  @ApiProperty({ example: '0.15', description: 'Số lượng mua' })
  @IsDecimalString()
  quantity!: string;

  @ApiProperty({ example: '6000.00', description: 'Tổng chi phí (USDT)' })
  @IsDecimalString()
  costBasisUsdt!: string;

  @ApiProperty({ enum: AllocationFundingSource })
  @IsEnum(AllocationFundingSource)
  fundingSource!: AllocationFundingSource;

  @ApiProperty({ required: false, description: 'Bắt buộc khi fundingSource=BORROW; phải là Borrow Position đang OPEN của chính user' })
  @IsOptional()
  @IsString()
  fundingBorrowPositionId?: string;
}
