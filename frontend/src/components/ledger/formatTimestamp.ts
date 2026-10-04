// Shared by every ledger/risk-engine widget that shows "data as of <time>"
// (AvailableCapitalWidget, RiskSummaryWidget, RiskCheckAction) — extracted
// after code review flagged 3 byte-identical copies.
export function formatTimestamp(iso: string): string {
  return new Date(iso).toUTCString().replace('GMT', 'UTC');
}
