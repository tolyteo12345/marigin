import { useEffect, useState, type FormEvent } from 'react';
import { Button, InlineAlert, TextField } from '../common';
import { createCorrection, listEvents, newIdempotencyKey, ApiError } from '../../api/ledgerClient';
import type { LedgerEventView } from '../../api/ledgerTypes';

interface EventHistoryPanelProps {
  borrowPositionId: string;
  onCorrected: () => void;
}

// design/capital-provenance-ledger.md mục 10 (AC-008, US-006 phần "xử lý thủ công").
export function EventHistoryPanel({ borrowPositionId, onCorrected }: EventHistoryPanelProps) {
  const [events, setEvents] = useState<LedgerEventView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [correctingEventId, setCorrectingEventId] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setEvents(await listEvents({ borrowPositionId }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không thể tải lịch sử, vui lòng thử lại.');
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [borrowPositionId]);

  async function handleCorrected() {
    setCorrectingEventId(null);
    await load();
    onCorrected();
  }

  return (
    <div className="mt-2">
      <h4>Lịch sử sự kiện</h4>
      {error && <InlineAlert>{error}</InlineAlert>}
      {events && (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th scope="col" className="text-left">Thời gian</th>
              <th scope="col" className="text-left">Loại sự kiện</th>
              <th scope="col" className="text-left">Chi tiết</th>
              <th scope="col" className="text-left">Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id}>
                <td>{new Date(event.createdAt).toLocaleString('vi-VN')}</td>
                <td>{event.type}</td>
                <td>{JSON.stringify(event.payload)}</td>
                <td>
                  {event.correctsEventId ? (
                    `Điều chỉnh cho sự kiện ${event.correctsEventId}`
                  ) : (
                    <Button variant="secondary" onClick={() => setCorrectingEventId(event.id)}>
                      Tạo điều chỉnh
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {correctingEventId && (
        <CorrectionForm
          borrowPositionId={borrowPositionId}
          targetEventId={correctingEventId}
          onDone={handleCorrected}
          onCancel={() => setCorrectingEventId(null)}
        />
      )}
    </div>
  );
}

interface CorrectionFormProps {
  borrowPositionId: string;
  targetEventId: string;
  onDone: () => void;
  onCancel: () => void;
}

function CorrectionForm({ borrowPositionId, targetEventId, onDone, onCancel }: CorrectionFormProps) {
  const [reason, setReason] = useState('');
  const [newLiabilityLedger, setNewLiabilityLedger] = useState('');
  const [newReservedAmountUsdt, setNewReservedAmountUsdt] = useState('');
  const [idempotencyKey] = useState(newIdempotencyKey());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await createCorrection(
        targetEventId,
        {
          reason,
          borrowPositionId,
          ...(newLiabilityLedger ? { newLiabilityLedger } : {}),
          ...(newReservedAmountUsdt ? { newReservedAmountUsdt } : {}),
        },
        idempotencyKey,
      );
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không thể tạo điều chỉnh, vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 rounded-lg border border-[var(--color-border)] p-3">
      <h4 className="mt-0">Tạo điều chỉnh (correction)</h4>
      <TextField label="Lý do điều chỉnh" value={reason} onChange={(e) => setReason(e.target.value)} required disabled={submitting} />
      <TextField
        label="Giá trị liabilityLedger mới (để trống nếu không đổi)"
        type="text"
        inputMode="decimal"
        value={newLiabilityLedger}
        onChange={(e) => setNewLiabilityLedger(e.target.value)}
        disabled={submitting}
      />
      <TextField
        label="Giá trị reservedAmountUsdt mới (để trống nếu không đổi)"
        type="text"
        inputMode="decimal"
        value={newReservedAmountUsdt}
        onChange={(e) => setNewReservedAmountUsdt(e.target.value)}
        disabled={submitting}
      />
      <p className="text-xs text-[var(--color-text-secondary)]">
        Sự kiện gốc KHÔNG bị xoá hay sửa — hệ thống chỉ thêm một bản ghi điều chỉnh mới, có thể xem lại toàn bộ lịch sử bất cứ
        lúc nào.
      </p>
      {error && <InlineAlert>{error}</InlineAlert>}
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          Xác nhận điều chỉnh
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
          Huỷ
        </Button>
      </div>
    </form>
  );
}
