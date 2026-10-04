// Response shapes for risk-engine (architecture/risk-engine.md). Every
// numeric-looking field stays `string` end-to-end — never parsed to
// number/float in the response (AGENTS.md "không float cho money/quantity").

export interface ExposurePositionView {
  id: string;
  borrowedAsset: string;
  quantity: string;
  firstBorrowEntryPrice: string;
  initialExposureUsdt: string;
}

export type CollateralStatus = 'OK' | 'NO_VERIFIED_CONNECTION' | 'READ_ERROR';

export interface CollateralView {
  status: CollateralStatus;
  value: string | null;
  fetchedAt: string | null;
  sourceConnectionId: string | null;
  errorMessage: string | null;
  // COND-001: fixed disclaimer string so every call site shows the same
  // wording instead of each frontend screen hardcoding its own copy.
  disclaimer: string;
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
