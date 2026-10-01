import { useState } from 'react';
import { Button, InlineAlert, InlineStatus } from '../common';
import { getAccountSnapshot, ApiError } from '../../api/binanceConnectionClient';
import type { AccountSnapshot } from '../../api/binanceConnectionTypes';

interface AccountSnapshotPanelProps {
  connectionId: string;
}

function formatFetchedAt(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} UTC ${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
}

// design/binance-read-only-connection.md mục 4. On-demand: trigger khi user
// mở panel/nhấn nút lần đầu, không auto-poll sau đó.
export function AccountSnapshotPanel({ connectionId }: AccountSnapshotPanelProps) {
  const [snapshot, setSnapshot] = useState<AccountSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setSnapshot(await getAccountSnapshot(connectionId));
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        const retryAfterSeconds = (err.body as { retryAfterSeconds?: number } | null)?.retryAfterSeconds ?? 60;
        setError(`Binance đang giới hạn tần suất truy cập, vui lòng thử lại sau ${retryAfterSeconds} giây.`);
      } else if (err instanceof ApiError && err.status === 503) {
        setError('Không thể tải dữ liệu (mất kết nối hoặc hết thời gian chờ), vui lòng thử lại.');
      } else {
        setError(err instanceof ApiError ? err.message : 'Không thể tải dữ liệu, vui lòng thử lại.');
      }
    } finally {
      setLoading(false);
    }
  }

  if (!snapshot && !loading && !error) {
    return (
      <Button variant="secondary" onClick={load}>
        Xem số dư margin
      </Button>
    );
  }

  const cellClassName = 'border-b border-[var(--color-border)] px-2 py-1 text-left text-xs';

  return (
    <div className="flex flex-col items-start gap-2">
      {loading && <InlineStatus>Đang tải dữ liệu từ Binance...</InlineStatus>}
      {error && (
        <>
          <InlineAlert>{error}</InlineAlert>
          <Button variant="secondary" onClick={load} disabled={loading}>
            Thử lại
          </Button>
        </>
      )}
      {snapshot && (
        <>
          <table className="my-2 w-full border-collapse font-[var(--font-mono)]">
            <thead>
              <tr>
                <th scope="col" className={cellClassName}>
                  Asset
                </th>
                <th scope="col" className={cellClassName}>
                  Borrowed
                </th>
                <th scope="col" className={cellClassName}>
                  Free
                </th>
                <th scope="col" className={cellClassName}>
                  Interest
                </th>
                <th scope="col" className={cellClassName}>
                  Net Asset
                </th>
              </tr>
            </thead>
            <tbody>
              {snapshot.userAssets.map((asset) => (
                <tr key={asset.asset}>
                  <td className={cellClassName}>{asset.asset}</td>
                  <td className={cellClassName}>{asset.borrowed ?? '—'}</td>
                  <td className={cellClassName}>{asset.free ?? '—'}</td>
                  <td className={cellClassName}>{asset.interest ?? '—'}</td>
                  <td className={cellClassName}>{asset.netAsset ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-[var(--color-text-secondary)]">Dữ liệu tại {formatFetchedAt(snapshot.fetchedAt)}</p>
          <Button variant="secondary" onClick={load} disabled={loading}>
            Làm mới
          </Button>
        </>
      )}
    </div>
  );
}
