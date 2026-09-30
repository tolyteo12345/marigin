// Mirrors backend/src/binance-connection/connection-view.ts and
// binance-connection.service.ts AccountSnapshot — see
// design/binance-read-only-connection.md and architecture/binance-read-only-connection.md.

export type ConnectionStatus =
  | 'PENDING_VERIFY'
  | 'VERIFIED'
  | 'INVALID'
  | 'UNSUPPORTED_ACCOUNT_MODE'
  | 'VERIFY_UNKNOWN'
  | 'REVOKED';

export interface PermissionSnapshot {
  ipRestrict: boolean;
  enableReading: boolean;
  enableMargin: boolean;
  enableSpotAndMarginTrading: boolean;
  enableWithdrawals: boolean;
  enableInternalTransfer: boolean;
  enableFutures: boolean;
  enableVanillaOptions: boolean;
  enablePortfolioMarginTrading: boolean;
  checkedAt: string;
}

export interface ConnectionView {
  id: string;
  label: string;
  status: ConnectionStatus;
  accountType: string | null;
  permissionSnapshot: PermissionSnapshot | null;
  permissionUnknown: boolean;
  lastError: string | null;
  lastVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CrossMarginUserAsset {
  asset: string;
  borrowed: string;
  free: string;
  interest: string;
  locked: string;
  netAsset: string;
}

export interface AccountSnapshot {
  fetchedAt: string;
  accountType: string;
  marginLevel: string;
  totalAssetOfBtc: string;
  totalLiabilityOfBtc: string;
  totalNetAssetOfBtc: string;
  userAssets: CrossMarginUserAsset[];
}

export interface RateLimitedErrorBody {
  message: string;
  retryAfterSeconds: number;
}
