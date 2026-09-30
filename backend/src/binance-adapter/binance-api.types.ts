// Field names/shapes per analysis/binance-read-only-connection-feasibility.md
// EV-001 (GET /sapi/v1/margin/account) and EV-003 (GET /sapi/v1/account/apiRestrictions).
// All numeric-looking fields are kept as `string` end-to-end (architecture doc
// "Financial formulas" — never parsed to number/float anywhere in this app).

export interface CrossMarginUserAsset {
  asset: string;
  borrowed: string;
  free: string;
  interest: string;
  locked: string;
  netAsset: string;
}

export interface CrossMarginAccountResponse {
  accountType: 'MARGIN_1' | 'MARGIN_2' | string; // MARGIN_1 = Cross Margin Classic, MARGIN_2 = Cross Margin Pro
  created: boolean;
  borrowEnabled: boolean;
  marginLevel: string;
  collateralMarginLevel: string;
  totalAssetOfBtc: string;
  totalLiabilityOfBtc: string;
  totalNetAssetOfBtc: string;
  totalCollateralValueInUSDT: string;
  tradeEnabled: boolean;
  transferInEnabled: boolean;
  transferOutEnabled: boolean;
  userAssets: CrossMarginUserAsset[];
}

export interface ApiKeyRestrictionsResponse {
  ipRestrict: boolean;
  enableReading: boolean;
  enableMargin: boolean;
  enableSpotAndMarginTrading: boolean;
  enableWithdrawals: boolean;
  enableInternalTransfer: boolean;
  enableFutures: boolean;
  enableVanillaOptions: boolean;
  enablePortfolioMarginTrading: boolean;
}

export type BinanceAdapterResult<T> =
  | { ok: true; data: T; usedWeight?: string }
  | {
      ok: false;
      kind: 'HTTP_ERROR';
      httpStatus: number;
      binanceCode?: number;
      message: string;
      retryAfterSeconds?: number;
    }
  | { ok: false; kind: 'NETWORK_OR_TIMEOUT'; message: string };
