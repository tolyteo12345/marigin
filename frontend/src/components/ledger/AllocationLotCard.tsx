import { useState, type FormEvent } from 'react';
import { Button, InlineAlert, InlineStatus, TextField } from '../common';
import { sellLot, newIdempotencyKey, ApiError } from '../../api/ledgerClient';
import type { AllocationLotView } from '../../api/ledgerTypes';
import { isDecimalString } from './decimalInput';

interface AllocationLotCardProps {
  lot: AllocationLotView;
  onUpdated: (lot: AllocationLotView) => void;
}

// design/capital-provenance-ledger.md mục 7/8 (US-004, AC-005).
export function AllocationLotCard({ lot, onUpdated }: AllocationLotCardProps) {
  const [selling, setSelling] = useState(false);
  const [quantitySold, setQuantitySold] = useState('');
  const [proceedsUsdt, setProceedsUsdt] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remainingIsZero = Number(lot.remainingQuantity) === 0;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!isDecimalString(quantitySold) || !isDecimalString(proceedsUsdt)) {
      setError('Số lượng và USDT phải là số thập phân không âm.');
      return;
    }
    setSubmitting(true);
    try {
      const updated = await sellLot(lot.id, { quantitySold, proceedsUsdt }, idempotencyKey);
      onUpdated(updated);
      setSelling(false);
      setQuantitySold('');
      setProceedsUsdt('');
      setIdempotencyKey(newIdempotencyKey());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không thể ghi nhận, vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-2 rounded-lg border border-[var(--color-border)] p-3">
      <p className="m-0 text-sm">
        {lot.asset} — còn lại {lot.remainingQuantity} / {lot.quantity} (chi phí {lot.costBasisUsdt} USDT, nguồn{' '}
        {lot.fundingSource === 'BORROW' ? 'khoản vay' : 'cá nhân'})
      </p>
      {remainingIsZero && <InlineStatus>Đã bán hết</InlineStatus>}
      {!remainingIsZero && !selling && (
        <Button variant="secondary" onClick={() => setSelling(true)}>
          Ghi nhận bán lot
        </Button>
      )}
      {selling && (
        <form onSubmit={handleSubmit} className="mt-2">
          {lot.fundingSource === 'BORROW' && (
            <InlineAlert>
              Toàn bộ USDT thực nhận nhập bên dưới sẽ được GIỮ LẠI (reserved) để trả nợ, không dùng làm vốn tự do cho tới khi
              trả hết khoản vay liên quan.
            </InlineAlert>
          )}
          <TextField
            label={`Số lượng bán (còn lại ${lot.remainingQuantity})`}
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
          {error && <InlineAlert>{error}</InlineAlert>}
          <div className="flex gap-2">
            <Button type="submit" disabled={submitting}>
              Xác nhận bán
            </Button>
            <Button type="button" variant="secondary" onClick={() => setSelling(false)} disabled={submitting}>
              Huỷ
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
