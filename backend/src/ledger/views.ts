import { AllocationLot, BorrowPosition, LedgerEvent } from '@prisma/client';

// Response shapes — every Decimal field is serialized as a string, never a
// JS number, so clients cannot be tempted to do float math on it either
// (AGENTS.md "không float cho money/quantity/rates").
export interface BorrowPositionView {
  id: string;
  borrowedAsset: string;
  quantity: string;
  firstBorrowEntryPrice: string;
  liabilityLedger: string;
  liabilityBinanceLast: string | null;
  reservedAmountUsdt: string;
  status: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  repaidAt: Date | null;
}

export function toBorrowPositionView(p: BorrowPosition): BorrowPositionView {
  return {
    id: p.id,
    borrowedAsset: p.borrowedAsset,
    quantity: p.quantity.toString(),
    firstBorrowEntryPrice: p.firstBorrowEntryPrice.toString(),
    liabilityLedger: p.liabilityLedger.toString(),
    liabilityBinanceLast: p.liabilityBinanceLast?.toString() ?? null,
    reservedAmountUsdt: p.reservedAmountUsdt.toString(),
    status: p.status,
    version: p.version,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    repaidAt: p.repaidAt,
  };
}

export interface AllocationLotView {
  id: string;
  asset: string;
  quantity: string;
  remainingQuantity: string;
  costBasisUsdt: string;
  fundingSource: string;
  fundingBorrowPositionId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export function toAllocationLotView(l: AllocationLot): AllocationLotView {
  return {
    id: l.id,
    asset: l.asset,
    quantity: l.quantity.toString(),
    remainingQuantity: l.remainingQuantity.toString(),
    costBasisUsdt: l.costBasisUsdt.toString(),
    fundingSource: l.fundingSource,
    fundingBorrowPositionId: l.fundingBorrowPositionId,
    version: l.version,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  };
}

export interface LedgerEventView {
  id: string;
  type: string;
  borrowPositionId: string | null;
  allocationLotId: string | null;
  payload: unknown;
  correctsEventId: string | null;
  createdAt: Date;
}

export function toLedgerEventView(e: LedgerEvent): LedgerEventView {
  return {
    id: e.id,
    type: e.type,
    borrowPositionId: e.borrowPositionId,
    allocationLotId: e.allocationLotId,
    payload: e.payload,
    correctsEventId: e.correctsEventId,
    createdAt: e.createdAt,
  };
}
