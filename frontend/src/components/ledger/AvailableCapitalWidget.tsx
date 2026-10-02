import { useEffect, useState, type FormEvent } from 'react';
import { Button, InlineAlert, TextField } from '../common';
import { getAvailableCapital, updatePersonalCapital, ApiError } from '../../api/ledgerClient';
import type { AvailableCapitalView } from '../../api/ledgerTypes';
import { isDecimalString } from './decimalInput';

function formatTimestamp(iso: string): string {
  return new Date(iso).toUTCString().replace('GMT', 'UTC');
}

// design/capital-provenance-ledger.md mục 2.
export function AvailableCapitalWidget() {
  const [data, setData] = useState<AvailableCapitalView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [personalCapitalInput, setPersonalCapitalInput] = useState('');
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const result = await getAvailableCapital();
      setData(result);
      setPersonalCapitalInput(result.personalCapitalUsdt);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không thể tải số liệu vốn khả dụng, vui lòng thử lại.');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleUpdatePersonalCapital(event: FormEvent) {
    event.preventDefault();
    setUpdateError(null);
    if (!isDecimalString(personalCapitalInput)) {
      setUpdateError('Vốn cá nhân phải là số thập phân không âm.');
      return;
    }
    setUpdating(true);
    try {
      await updatePersonalCapital(personalCapitalInput);
      await load();
    } catch (err) {
      setUpdateError(err instanceof ApiError ? err.message : 'Không thể cập nhật, vui lòng thử lại.');
    } finally {
      setUpdating(false);
    }
  }

  return (
    <section className="mb-6 rounded-xl border border-[var(--color-border)] p-4">
      <h3 className="mt-0">Vốn khả dụng</h3>
      {error && <InlineAlert>{error}</InlineAlert>}
      {data && (
        <div className="mb-3 text-sm">
          <p>
            Vốn tự do: <strong>{data.freeCapitalUsdt} USDT</strong>
          </p>
          <p>Đang giữ (reserved): {data.totalReservedUsdt} USDT</p>
          <p className="text-xs text-[var(--color-text-secondary)]">Dữ liệu tại {formatTimestamp(data.asOf)}</p>
          <Button variant="secondary" onClick={load}>
            Làm mới
          </Button>
        </div>
      )}
      <form onSubmit={handleUpdatePersonalCapital}>
        <TextField
          label="Vốn cá nhân xác định (USDT)"
          type="text"
          inputMode="decimal"
          value={personalCapitalInput}
          onChange={(e) => setPersonalCapitalInput(e.target.value)}
          disabled={updating}
        />
        <p className="text-xs text-[var(--color-text-secondary)]">
          Số bạn tự xác nhận là vốn cá nhân, không lấy từ balance Binance.
        </p>
        {updateError && <InlineAlert>{updateError}</InlineAlert>}
        <Button type="submit" variant="secondary" disabled={updating}>
          Cập nhật
        </Button>
      </form>
    </section>
  );
}
