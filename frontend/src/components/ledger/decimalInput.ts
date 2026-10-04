// Mirrors backend/src/ledger/decimal-string.ts: plain non-negative decimal
// strings only (no sign, no exponent, no thousands separators). Checked
// client-side before submit per design/capital-provenance-ledger.md "Lưu ý
// Decimal" — the server re-validates regardless, this just avoids a round
// trip for an obviously malformed value.
const DECIMAL_STRING_PATTERN = /^\d+(\.\d+)?$/;

export function isDecimalString(value: string): boolean {
  return DECIMAL_STRING_PATTERN.test(value);
}

// String-only zero check (no `Number()`/float parse) for money/quantity
// inputs — AGENTS.md "không float cho money/quantity/rates". Only meaningful
// on a value that already passed isDecimalString.
export function isZeroDecimalString(value: string): boolean {
  return /^0+(\.0+)?$/.test(value);
}
