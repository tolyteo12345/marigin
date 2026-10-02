// Mirrors backend/src/ledger/decimal-string.ts: plain non-negative decimal
// strings only (no sign, no exponent, no thousands separators). Checked
// client-side before submit per design/capital-provenance-ledger.md "Lưu ý
// Decimal" — the server re-validates regardless, this just avoids a round
// trip for an obviously malformed value.
const DECIMAL_STRING_PATTERN = /^\d+(\.\d+)?$/;

export function isDecimalString(value: string): boolean {
  return DECIMAL_STRING_PATTERN.test(value);
}
