import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { IsDecimalString } from '../decimal-string';

// Deliberately simple design (COND-004 / OQ-P05 scope): a correction is a
// manual, explicit "set this field to this value, here is why" record — not
// an attempt to generically replay/reverse the original event's math. Keeps
// every correction auditable (before/after captured in the LedgerEvent
// payload) without the service having to guess intent for cases the
// requirement explicitly left as "handle manually" (fee in another token,
// overpayment, external transfer, dust).
export class CorrectionDto {
  @ApiProperty({ description: 'Lý do điều chỉnh, ghi vào audit' })
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiProperty({ required: false, description: 'BorrowPosition cần điều chỉnh (nếu có)' })
  @IsOptional()
  @IsString()
  borrowPositionId?: string;

  @ApiProperty({ required: false, description: 'Giá trị liabilityLedger mới (đơn vị borrowedAsset)' })
  @IsOptional()
  @IsDecimalString()
  newLiabilityLedger?: string;

  @ApiProperty({ required: false, description: 'Giá trị reservedAmountUsdt mới' })
  @IsOptional()
  @IsDecimalString()
  newReservedAmountUsdt?: string;

  @ApiProperty({ required: false, description: 'AllocationLot cần điều chỉnh (nếu có)' })
  @IsOptional()
  @IsString()
  allocationLotId?: string;

  @ApiProperty({ required: false, description: 'Giá trị remainingQuantity mới của lot' })
  @IsOptional()
  @IsDecimalString()
  newRemainingQuantity?: string;
}
