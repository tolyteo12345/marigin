import { useState } from 'react';
import { Button, InlineAlert, InlineStatus, TextField } from '../common';
import { checkPositionRisk, ApiError } from '../../api/riskEngineClient';
import type { BorrowPositionView } from '../../api/ledgerTypes';
import type { PositionRiskCheckView } from '../../api/riskEngineTypes';
import { isDecimalString, isZeroDecimalString } from './decimalInput';
import { formatTimestamp } from './formatTimestamp';

interface RiskCheckActionProps {
  position: BorrowPositionView;
}

// design/risk-engine.md mục 2 (R2 — docs/RISK_RULES.md, AC-001..AC-004, AC-010).
// Stateless by design (BR-003): currentPrice/result only live in this
// component's state, never persisted — every submit replaces the previous
// result outright, nothing is merged.
export function RiskCheckAction({ position }: RiskCheckActionProps) {
  const [currentPrice, setCurrentPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PositionRiskCheckView | null>(null);

  const invalidInput = currentPrice.length > 0 && (!isDecimalString(currentPrice) || isZeroDecimalString(currentPrice));

  async function handleSubmit() {
    setError(null);
    if (!isDecimalString(currentPrice) || isZeroDecimalString(currentPrice)) {
      setError('Giá hiện tại phải là số thập phân lớn hơn 0.');
      return;
    }
    setSubmitting(true);
    try {
      setResult(await checkPositionRisk(position.id, currentPrice));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không thể kiểm tra lúc này, thử lại.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-2 rounded-lg border border-[var(--color-border)] p-3">
      <h4 className="mt-0 text-sm">Kiểm tra rủi ro (2× giá vay đầu)</h4>

      {result === null && <p className="m-0 text-sm text-[var(--color-text-secondary)]">Chưa kiểm tra</p>}

      <div className="mt-2 flex flex-wrap items-end gap-2">
        <TextField
          label={`Giá hiện tại của ${position.borrowedAsset} (USDT)`}
          type="text"
          inputMode="decimal"
          value={currentPrice}
          onChange={(e) => setCurrentPrice(e.target.value)}
          disabled={submitting}
        />
        <Button onClick={handleSubmit} disabled={submitting || currentPrice.length === 0 || invalidInput}>
          Kiểm tra
        </Button>
      </div>

      {error && <InlineAlert>{error}</InlineAlert>}

      {result && result.status === 'OK' && (
        <InlineStatus>
          OK — giá hiện tại ({result.currentPrice}) chưa chạm ngưỡng 2× giá vay đầu ({result.firstBorrowEntryPrice}). Kiểm tra
          lúc {formatTimestamp(result.checkedAt)}.
        </InlineStatus>
      )}

      {result && result.status === 'CRITICAL_REPAY_REQUIRED' && (
        <InlineAlert>
          ⚠ CẦN CHUẨN BỊ TRẢ NỢ — giá hiện tại ({result.currentPrice}) đã ≥ 2× giá vay đầu ({result.firstBorrowEntryPrice}).
          Liability hiện tại: {result.liabilityLedger} {result.borrowedAsset}. Ước tính USDT cần mua lại: {result.buybackCostEstimateUsdt} USDT
          (ước tính, CHƯA gồm fee/slippage mua lại thực tế — xem giá thật trên Binance trước khi hành động). Kiểm tra lúc{' '}
          {formatTimestamp(result.checkedAt)}.
        </InlineAlert>
      )}
    </div>
  );
}
