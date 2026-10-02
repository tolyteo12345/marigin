import { useEffect, useState } from 'react';
import { Button, InlineStatus } from '../common';
import { listAllocationLots } from '../../api/ledgerClient';
import type { AllocationLotView, BorrowPositionView } from '../../api/ledgerTypes';
import { SellAssetForm } from './SellAssetForm';
import { RepayForm } from './RepayForm';
import { ReconcilePanel } from './ReconcilePanel';
import { AllocationLotCard } from './AllocationLotCard';
import { EventHistoryPanel } from './EventHistoryPanel';

interface BorrowPositionCardProps {
  position: BorrowPositionView;
  onUpdated: (position: BorrowPositionView) => void;
  onRefreshNeeded: () => void;
}

// design/capital-provenance-ledger.md mục 4.
export function BorrowPositionCard({ position, onUpdated, onRefreshNeeded }: BorrowPositionCardProps) {
  const [lots, setLots] = useState<AllocationLotView[]>([]);
  const [showSellAsset, setShowSellAsset] = useState(false);
  const [showRepay, setShowRepay] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    void listAllocationLots(position.id).then(setLots).catch(() => setLots([]));
  }, [position.id, refreshToken]);

  function refresh() {
    setRefreshToken((t) => t + 1);
  }

  const locked = position.status === 'DRIFT_DETECTED';
  const terminal = position.status === 'REPAID';

  return (
    <div className="mb-4 rounded-xl border border-[var(--color-border)] p-4">
      <p className="m-0">
        <strong>{position.borrowedAsset}</strong> — số lượng {position.quantity}, giá vay đầu {position.firstBorrowEntryPrice} USDT
      </p>
      <p className="m-0 text-sm">
        Liability: {position.liabilityLedger} {position.borrowedAsset} · Đang giữ: {position.reservedAmountUsdt} USDT
      </p>

      {terminal && <InlineStatus>Đã trả hết</InlineStatus>}
      {position.status === 'OPEN' && <p className="text-sm text-[var(--color-text-secondary)]">Đang mở</p>}

      {!terminal && !locked && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setShowSellAsset((v) => !v)}>
            Ghi nhận bán tài sản vay
          </Button>
          <Button variant="secondary" onClick={() => setShowRepay((v) => !v)}>
            Ghi nhận trả nợ
          </Button>
        </div>
      )}

      {!terminal && <ReconcilePanel position={position} onReconciled={onRefreshNeeded} />}

      {showSellAsset && (
        <SellAssetForm
          position={position}
          onDone={() => {
            setShowSellAsset(false);
            refresh();
          }}
          onCancel={() => setShowSellAsset(false)}
        />
      )}
      {showRepay && (
        // Deliberately does NOT close the form on success (unlike
        // SellAssetForm): RepayForm shows its own "đã trả hết / đã giải
        // phóng" confirmation inline (design mục 8b), which would never be
        // seen if the form unmounted the instant the request resolved. The
        // toggle button stays available to collapse it once read.
        <RepayForm position={position} onDone={onUpdated} onCancel={() => setShowRepay(false)} />
      )}

      {lots.length > 0 && (
        <div className="mt-2">
          <p className="m-0 text-sm font-medium">Allocation lots từ khoản vay này:</p>
          {lots.map((lot) => (
            <AllocationLotCard key={lot.id} lot={lot} onUpdated={refresh} />
          ))}
        </div>
      )}

      <Button variant="secondary" onClick={() => setShowHistory((v) => !v)} className="mt-2">
        {showHistory ? 'Ẩn lịch sử' : 'Xem lịch sử'}
      </Button>
      {showHistory && (
        <EventHistoryPanel
          borrowPositionId={position.id}
          onCorrected={() => {
            refresh();
            onRefreshNeeded();
          }}
        />
      )}
    </div>
  );
}
