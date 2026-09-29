// Shared API response/request shapes for the user-authentication feature.
// Mirrors architecture/user-authentication.md "API contracts và state machines".
// ASSUMPTION (to be confirmed against real backend-agent implementation):
// - CSRF token is returned as { csrfToken: string } from GET /api/auth/csrf-token.
// - CSRF header name is "x-csrf-token" (csrf-sync default convention).
// - Non-2xx JSON error bodies look like { message: string }.

export type TelegramLoginRequestStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'CLAIMED'
  | 'EXPIRED'
  | 'REJECTED';

export interface CsrfTokenResponse {
  csrfToken: string;
}

export interface TelegramStartResponse {
  code: string;
  deepLinkUrl: string;
  expiresAt: string; // ISO date string
}

export interface TelegramStatusResponse {
  status: TelegramLoginRequestStatus;
  reason?: string;
}

export interface MeResponse {
  userId: string;
  hasLocalCredential: boolean;
  hasTelegramIdentity: boolean;
  localEmailMasked?: string;
}

export interface ApiErrorBody {
  message?: string;
}

export class ApiError extends Error {
  status: number;
  body: ApiErrorBody | null;

  constructor(status: number, body: ApiErrorBody | null) {
    super(body?.message ?? `Request failed with status ${status}`);
    this.status = status;
    this.body = body;
  }
}
