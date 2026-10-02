import { useState, type FormEvent } from 'react';
import { Button, InlineAlert, TextField } from '../common';
import { createBorrowPosition, newIdempotencyKey, ApiError } from '../../api/ledgerClient';
import type { BorrowPositionView } from '../../api/ledgerTypes';
import { isDecimalString } from './decimalInput';

interface BorrowPositionFormProps {
  onCreated: (position: BorrowPositionView) => void;
}

// design/capital-provenance-ledger.md mục 3 (US-001, AC-001, AC-002, BR-002).
export function BorrowPositionForm({ onCreated }: BorrowPositionFormProps) {
  const [borrowedAsset, setBorrowedAsset] = useState('');
  const [quantity, setQuantity] = useState('');
  const [firstBorrowEntryPrice, setFirstBorrowEntryPrice] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setBorrowedAsset('');
    setQuantity('');
    setFirstBorrowEntryPrice('');
    setIdempotencyKey(newIdempotencyKey());
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!isDecimalString(quantity) || !isDecimalString(firstBorrowEntryPrice)) {
      setError('Số lượng và giá phải là số thập phân không âm.');
      return;
    }
    setSubmitting(true);
    try {
      const position = await createBorrowPosition(
        { borrowedAsset: borrowedAsset.trim(), quantity, firstBorrowEntryPrice },
        idempotencyKey,
      );
      onCreated(position);
      resetForm();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không thể ghi nhận khoản vay, vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-6">
      <h3>Ghi nhận khoản vay mới</h3>
      <TextField label="Tài sản vay" value={borrowedAsset} onChange={(e) => setBorrowedAsset(e.target.value)} required disabled={submitting} />
      <TextField
        label="Số lượng vay"
        type="text"
        inputMode="decimal"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        required
        disabled={submitting}
      />
      <TextField
        label="Giá tại thời điểm vay đầu tiên (USDT)"
        type="text"
        inputMode="decimal"
        value={firstBorrowEntryPrice}
        onChange={(e) => setFirstBorrowEntryPrice(e.target.value)}
        required
        disabled={submitting}
      />
      <p className="text-xs text-[var(--color-text-secondary)]">
        Giá này KHÔNG thể sửa sau khi lưu — kiểm tra kỹ trước khi xác nhận.
      </p>
      {error && <InlineAlert>{error}</InlineAlert>}
      <Button type="submit" disabled={submitting}>
        Ghi nhận khoản vay
      </Button>
    </form>
  );
}
