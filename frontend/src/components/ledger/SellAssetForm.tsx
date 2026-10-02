import { useState, type FormEvent } from 'react';
import { Button, InlineAlert, TextField } from '../common';
import { sellAsset, newIdempotencyKey, ApiError } from '../../api/ledgerClient';
import type { BorrowPositionView } from '../../api/ledgerTypes';
import { isDecimalString } from './decimalInput';

interface SellAssetFormProps {
  position: BorrowPositionView;
  onDone: () => void;
  onCancel: () => void;
}

// design/capital-provenance-ledger.md mục 5 (US-002, ASSET_SOLD).
export function SellAssetForm({ position, onDone, onCancel }: SellAssetFormProps) {
  const [quantitySold, setQuantitySold] = useState('');
  const [proceedsUsdt, setProceedsUsdt] = useState('');
  const [idempotencyKey] = useState(newIdempotencyKey());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!isDecimalString(quantitySold) || !isDecimalString(proceedsUsdt)) {
      setError('Số lượng và USDT phải là số thập phân không âm.');
      return;
    }
    setSubmitting(true);
    try {
      await sellAsset(position.id, { quantitySold, proceedsUsdt }, idempotencyKey);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không thể ghi nhận, vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 rounded-lg border border-[var(--color-border)] p-3">
      <h4 className="mt-0">Ghi nhận bán {position.borrowedAsset}</h4>
      <TextField
        label={`Số lượng ${position.borrowedAsset} đã bán`}
        type="text"
        inputMode="decimal"
        value={quantitySold}
        onChange={(e) => setQuantitySold(e.target.value)}
        required
        disabled={submitting}
      />
      <TextField
        label="Số USDT thực nhận (sau phí)"
        type="text"
        inputMode="decimal"
        value={proceedsUsdt}
        onChange={(e) => setProceedsUsdt(e.target.value)}
        required
        disabled={submitting}
      />
      <p className="text-xs text-[var(--color-text-secondary)]">
        Nhập đúng số USDT thực nhận sau khi trừ phí, không phải giá niêm yết.
      </p>
      {error && <InlineAlert>{error}</InlineAlert>}
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          Ghi nhận
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
          Huỷ
        </Button>
      </div>
    </form>
  );
}
