// All amounts/quantities are strings end-to-end — never parsed to number on
// this side either (AGENTS.md "không float cho money/quantity/rates").
export type BorrowPositionStatus = 'OPEN' | 'REPAID' | 'DRIFT_DETECTED';
export type AllocationAsset = 'BTC' | 'ETH';
export type AllocationFundingSource = 'PERSONAL' | 'BORROW';

export interface BorrowPositionView {
  id: string;
  borrowedAsset: string;
  quantity: string;
  firstBorrowEntryPrice: string;
  liabilityLedger: string;
  liabilityBinanceLast: string | null;
  reservedAmountUsdt: string;
  status: BorrowPositionStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  repaidAt: string | null;
}

export interface AllocationLotView {
  id: string;
  asset: AllocationAsset;
  quantity: string;
  remainingQuantity: string;
  costBasisUsdt: string;
  fundingSource: AllocationFundingSource;
  fundingBorrowPositionId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface LedgerEventView {
  id: string;
  type: string;
  borrowPositionId: string | null;
  allocationLotId: string | null;
  payload: unknown;
  correctsEventId: string | null;
  createdAt: string;
}

export type ReconcileResult =
  | { status: 'MATCHED'; liabilityLedger: string; liabilityBinanceLast: string }
  | { status: 'DRIFT_DETECTED'; liabilityLedger: string; liabilityBinanceLast: string }
  | { status: 'RECONCILE_UNKNOWN'; reason: string };

export interface AvailableCapitalView {
  personalCapitalUsdt: string;
  totalReservedUsdt: string;
  freeCapitalUsdt: string;
  asOf: string;
}
