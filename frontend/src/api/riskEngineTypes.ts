// All amounts/quantities are strings end-to-end — never parsed to number on
// this side either (AGENTS.md "không float cho money/quantity/rates").

export type CollateralStatus = 'OK' | 'NO_VERIFIED_CONNECTION' | 'READ_ERROR';

export interface CollateralView {
  status: CollateralStatus;
  value: string | null;
  fetchedAt: string | null;
  sourceConnectionId: string | null;
  errorMessage: string | null;
  disclaimer: string;
}

export interface ExposurePositionView {
  id: string;
  borrowedAsset: string;
  quantity: string;
  firstBorrowEntryPrice: string;
  initialExposureUsdt: string;
}

export interface ExposureSummaryView {
  positions: ExposurePositionView[];
  totalInitialExposureUsdt: string;
  collateral: CollateralView;
  cap: string | null;
  overCap: boolean;
  capUnavailableReason: string | null;
}

export interface PositionRiskCheckView {
  positionId: string;
  positionStatus: string;
  status: 'OK' | 'CRITICAL_REPAY_REQUIRED';
  firstBorrowEntryPrice: string;
  currentPrice: string;
  liabilityLedger: string;
  borrowedAsset: string;
  buybackCostEstimateUsdt: string | null;
  checkedAt: string;
}
