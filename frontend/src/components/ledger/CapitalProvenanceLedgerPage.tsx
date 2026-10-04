import { useEffect, useState } from 'react';
import { InlineAlert, Button } from '../common';
import { getBorrowPosition, listAllocationLots, listBorrowPositions, ApiError } from '../../api/ledgerClient';
import type { AllocationLotView, BorrowPositionView } from '../../api/ledgerTypes';
import { AvailableCapitalWidget } from './AvailableCapitalWidget';
import { RiskSummaryWidget } from './RiskSummaryWidget';
import { BorrowPositionForm } from './BorrowPositionForm';
import { AllocationLotForm } from './AllocationLotForm';
import { AllocationLotCard } from './AllocationLotCard';
import { BorrowPositionCard } from './BorrowPositionCard';

// design/capital-provenance-ledger.md mục 1.
export function CapitalProvenanceLedgerPage() {
  const [positions, setPositions] = useState<BorrowPositionView[] | null>(null);
  const [personalLots, setPersonalLots] = useState<AllocationLotView[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function loadPersonalLots() {
    const all = await listAllocationLots();
    setPersonalLots(all.filter((l) => l.fundingSource === 'PERSONAL'));
  }

  async function load() {
    setError(null);
    try {
      setPositions(await listBorrowPositions());
      await loadPersonalLots();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không thể tải danh sách, vui lòng thử lại.');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function handleCreated(position: BorrowPositionView) {
    setPositions((prev) => [position, ...(prev ?? [])]);
  }

  function handleUpdated(position: BorrowPositionView) {
    setPositions((prev) => (prev ?? []).map((p) => (p.id === position.id ? position : p)));
  }

  async function handleRefreshNeeded(positionId: string) {
    try {
      const updated = await getBorrowPosition(positionId);
      handleUpdated(updated);
    } catch {
      // Best-effort refresh — if it fails, the next full `load()` (e.g. page
      // revisit) will still catch up; not worth surfacing a 2nd error banner.
    }
  }

  return (
    <div>
      <h2>Sổ theo dõi nguồn vốn</h2>

      <RiskSummaryWidget />
      <AvailableCapitalWidget />

      {positions === null && !error && <p className="text-[var(--color-text-secondary)]">Đang tải...</p>}
      {error && (
        <div className="flex flex-col items-start gap-2">
          <InlineAlert>{error}</InlineAlert>
          <Button variant="secondary" onClick={load}>
            Thử lại
          </Button>
        </div>
      )}

      <BorrowPositionForm onCreated={handleCreated} />
      <AllocationLotForm onCreated={() => void loadPersonalLots()} />

      {positions !== null && positions.length === 0 && (
        <p className="text-[var(--color-text-secondary)]">Chưa có khoản vay nào được ghi nhận.</p>
      )}

      {positions?.map((position) => (
        <BorrowPositionCard
          key={position.id}
          position={position}
          onUpdated={handleUpdated}
          onRefreshNeeded={() => handleRefreshNeeded(position.id)}
        />
      ))}

      {personalLots.length > 0 && (
        <div>
          <h3>Lot vốn cá nhân</h3>
          {personalLots.map((lot) => (
            <AllocationLotCard key={lot.id} lot={lot} onUpdated={() => void loadPersonalLots()} />
          ))}
        </div>
      )}
    </div>
  );
}
