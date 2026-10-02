import { useEffect, useState, type FormEvent } from 'react';
import { Button, InlineAlert, SelectField, TextField } from '../common';
import { createAllocationLot, listBorrowPositions, newIdempotencyKey, ApiError } from '../../api/ledgerClient';
import type { AllocationAsset, AllocationLotView, BorrowPositionView } from '../../api/ledgerTypes';
import { isDecimalString } from './decimalInput';

interface AllocationLotFormProps {
  onCreated: (lot: AllocationLotView) => void;
}

const ASSET_OPTIONS = [
  { value: 'BTC', label: 'BTC' },
  { value: 'ETH', label: 'ETH' },
];

// design/capital-provenance-ledger.md mục 6 (US-003, US-008, AC-003, AC-004).
// SOL is intentionally not listed (AC-009) — not merely disabled, left out of
// the option list entirely so there is no way to pick it from this form.
export function AllocationLotForm({ onCreated }: AllocationLotFormProps) {
  const [asset, setAsset] = useState<AllocationAsset>('BTC');
  const [quantity, setQuantity] = useState('');
  const [costBasisUsdt, setCostBasisUsdt] = useState('');
  // Empty string = PERSONAL; any other value = that Borrow Position's id. A
  // single <select> can only ever produce one of these two shapes, which is
  // exactly BR-003's "exactly one funding source" — there is no form state
  // that could represent a mixed source.
  const [fundingBorrowPositionId, setFundingBorrowPositionId] = useState('');
  const [openPositions, setOpenPositions] = useState<BorrowPositionView[]>([]);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listBorrowPositions('OPEN').then(setOpenPositions).catch(() => setOpenPositions([]));
  }, []);

  function resetForm() {
    setAsset('BTC');
    setQuantity('');
    setCostBasisUsdt('');
    setFundingBorrowPositionId('');
    setIdempotencyKey(newIdempotencyKey());
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!isDecimalString(quantity) || !isDecimalString(costBasisUsdt)) {
      setError('Số lượng và chi phí phải là số thập phân không âm.');
      return;
    }
    setSubmitting(true);
    try {
      const lot = await createAllocationLot(
        {
          asset,
          quantity,
          costBasisUsdt,
          fundingSource: fundingBorrowPositionId ? 'BORROW' : 'PERSONAL',
          ...(fundingBorrowPositionId ? { fundingBorrowPositionId } : {}),
        },
        idempotencyKey,
      );
      onCreated(lot);
      resetForm();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không thể ghi nhận, vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  }

  const fundingOptions = [
    { value: '', label: 'Vốn cá nhân' },
    ...openPositions.map((p) => ({ value: p.id, label: `${p.borrowedAsset} — vay ngày ${new Date(p.createdAt).toLocaleDateString('vi-VN')}` })),
  ];

  return (
    <form onSubmit={handleSubmit} className="mb-6">
      <h3>Ghi nhận mua BTC/ETH</h3>
      <SelectField label="Tài sản" value={asset} onChange={(e) => setAsset(e.target.value as AllocationAsset)} options={ASSET_OPTIONS} disabled={submitting} />
      <TextField label="Số lượng mua" type="text" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} required disabled={submitting} />
      <TextField label="Tổng chi phí (USDT)" type="text" inputMode="decimal" value={costBasisUsdt} onChange={(e) => setCostBasisUsdt(e.target.value)} required disabled={submitting} />
      <SelectField
        label="Nguồn vốn"
        value={fundingBorrowPositionId}
        onChange={(e) => setFundingBorrowPositionId(e.target.value)}
        options={fundingOptions}
        disabled={submitting}
      />
      {error && <InlineAlert>{error}</InlineAlert>}
      <Button type="submit" disabled={submitting}>
        Ghi nhận
      </Button>
    </form>
  );
}
