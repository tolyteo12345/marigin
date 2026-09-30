import { BinanceConnection } from '@prisma/client';

// Response shape returned to the client — MUST NEVER include
// encryptedApiKey/encryptedApiSecret/encryptionIv, not even masked
// (architecture doc "Response API không bao giờ trả lại apiKey/apiSecret").
export interface ConnectionView {
  id: string;
  label: string;
  status: string;
  accountType: string | null;
  permissionSnapshot: unknown;
  permissionUnknown: boolean;
  lastError: string | null;
  lastVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toConnectionView(connection: BinanceConnection): ConnectionView {
  return {
    id: connection.id,
    label: connection.label,
    status: connection.status,
    accountType: connection.accountType,
    permissionSnapshot: connection.permissionSnapshot,
    permissionUnknown: connection.permissionUnknown,
    lastError: connection.lastError,
    lastVerifiedAt: connection.lastVerifiedAt,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  };
}
