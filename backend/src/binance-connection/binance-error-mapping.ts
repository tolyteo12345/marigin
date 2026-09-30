// Binance error codes classified as "credentials/signature/format wrong" per
// EV-005 general-info docs: -1021 (timestamp outside recvWindow — clock skew
// or expired signature), -1022 (signature invalid), -2008 (invalid API-key
// ID — CONFIRMED live 2026-09-30: a real GET /sapi/v1/margin/account call
// against api.binance.com with a garbage key returned exactly
// `{"code":-2008,"msg":"Invalid Api-Key ID."}`, HTTP 400 — this is the one
// entry in this list backed by a real response, not just docs, see
// features/binance-read-only-connection/implementation.md), -2014 (API-key
// format invalid), -2015 (invalid API-key, IP, or permissions for action).
// Everything else (-1021, -1022, -2014, -2015) is still NEEDS_VERIFICATION
// (RISK-001, analysis/binance-read-only-connection-feasibility.md): no Margin
// sandbox exists to confirm them against a real key/account in each state, so
// they are built from official docs only. The manual smoke test with a real
// margin account (QA gate) must confirm the remaining ones before treating
// this classification as final.
export const BINANCE_AUTH_ERROR_CODES = new Set([-1021, -1022, -2008, -2014, -2015]);

export function isAuthErrorCode(code: number | undefined): boolean {
  return code !== undefined && BINANCE_AUTH_ERROR_CODES.has(code);
}
