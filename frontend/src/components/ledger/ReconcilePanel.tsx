import { useState } from 'react';
import { Button, InlineAlert, InlineStatus } from '../common';
import { reconcile, ApiError } from '../../api/ledgerClient';
import type { BorrowPositionView } from '../../api/ledgerTypes';

interface ReconcilePanelProps {
  position: BorrowPositionView;
  onReconciled: () => void;
}

// design/capital-provenance-ledger.md mục 9/9b (AC-007, BR-009).
export function ReconcilePanel({ position, onReconciled }: ReconcilePanelProps) {
  const [checking, setChecking] = useState(false);
  const [matched, setMatched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReconcile() {
    setChecking(true);
    setError(null);
    setMatched(false);
    try {
      const result = await reconcile(position.id);
      if (result.status === 'RECONCILE_UNKNOWN') {
        setError(result.reason);
      } else if (result.status === 'MATCHED') {
        setMatched(true);
      }
      onReconciled();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không thể đối chiếu, vui lòng thử lại.');
    } finally {
      setChecking(false);
    }
  }

  if (position.status === 'DRIFT_DETECTED') {
    return (
      <div className="mt-2 rounded-lg border border-[var(--color-border)] p-3">
        <InlineAlert>Phát hiện lệch số liệu — xem chi tiết bên dưới.</InlineAlert>
        <p className="text-sm">Ledger nội bộ: {position.liabilityLedger} {position.borrowedAsset}</p>
        <p className="text-sm">Binance (lúc đối chiếu gần nhất): {position.liabilityBinanceLast} {position.borrowedAsset}</p>
        <p className="text-xs text-[var(--color-text-secondary)]">
          Hệ thống phát hiện lệch giữa số liệu ghi nhận và số liệu thực tế trên Binance. Các thao tác ghi nhận mới cho khoản vay
          này đã bị khoá cho tới khi bạn xử lý qua chức năng Correction trong lịch sử sự kiện.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-2">
      {checking && <InlineStatus>Đang đối chiếu với Binance...</InlineStatus>}
      {matched && <InlineStatus>Đã đối chiếu, số liệu khớp.</InlineStatus>}
      {error && <InlineAlert>{error}</InlineAlert>}
      <Button variant="secondary" onClick={handleReconcile} disabled={checking}>
        Đối chiếu với Binance
      </Button>
    </div>
  );
}
