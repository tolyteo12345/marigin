import { useState, type FormEvent } from 'react';
import { Button, InlineAlert, InlineStatus, TextField } from '../common';
import { repay, newIdempotencyKey, ApiError } from '../../api/ledgerClient';
import type { BorrowPositionView } from '../../api/ledgerTypes';
import { isDecimalString } from './decimalInput';

interface RepayFormProps {
  position: BorrowPositionView;
  onDone: (updated: BorrowPositionView) => void;
  onCancel: () => void;
}

// design/capital-provenance-ledger.md mục 8b (US-005, AC-006, AC-011).
export function RepayForm({ position, onDone, onCancel }: RepayFormProps) {
  const [amount, setAmount] = useState('');
  // Not `const [idempotencyKey] = useState(...)`: unlike every other ledger
  // form, RepayForm deliberately stays mounted after a successful submit (see
  // BorrowPositionCard) so its inline confirmation message stays visible —
  // which means a 2nd repay in the same open form must get a fresh key, or
  // the backend's idempotency replay (ledger.service.ts repay()) would treat
  // it as a retry of the first one and silently record nothing.
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BorrowPositionView | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!isDecimalString(amount)) {
      setError('Số lượng trả nợ phải là số thập phân không âm.');
      return;
    }
    setSubmitting(true);
    try {
      const updated = await repay(position.id, { amount }, idempotencyKey);
      setResult(updated);
      onDone(updated);
      setAmount('');
      setIdempotencyKey(newIdempotencyKey());
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Không thể ghi nhận trả nợ, vui lòng thử lại.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 rounded-lg border border-[var(--color-border)] p-3">
      <h4 className="mt-0">Ghi nhận trả nợ</h4>
      <p className="text-sm">
        Liability hiện tại: {position.liabilityLedger} {position.borrowedAsset}
      </p>
      <TextField
        label={`Số lượng trả nợ (${position.borrowedAsset})`}
        type="text"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        required
        disabled={submitting}
      />
      {error && (
        <InlineAlert>
          {error} {error.includes('vượt quá') && 'Dùng chức năng Correction trong lịch sử sự kiện nếu cần điều chỉnh thủ công.'}
        </InlineAlert>
      )}
      {result?.status === 'REPAID' && (
        <InlineStatus>Đã trả hết khoản vay. Toàn bộ số tiền đang giữ (nếu có) đã được giải phóng thành vốn tự do.</InlineStatus>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          Ghi nhận trả nợ
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
          Huỷ
        </Button>
      </div>
    </form>
  );
}
