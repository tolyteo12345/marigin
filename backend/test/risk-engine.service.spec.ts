import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { LedgerService } from '../src/ledger/ledger.service';
import { BinanceConnectionService } from '../src/binance-connection/binance-connection.service';
import { RiskEngineService } from '../src/risk-engine/risk-engine.service';
import { BorrowPositionView } from '../src/ledger/views';

function makePositionView(overrides: Partial<BorrowPositionView> = {}): BorrowPositionView {
  return {
    id: 'pos-1',
    borrowedAsset: 'ZEC',
    quantity: '25.1',
    firstBorrowEntryPrice: '420',
    liabilityLedger: '25.1',
    liabilityBinanceLast: null,
    reservedAmountUsdt: '0',
    status: 'OPEN',
    version: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    repaidAt: null,
    ...overrides,
  };
}

describe('RiskEngineService', () => {
  let ledger: DeepMockProxy<LedgerService>;
  let binanceConnections: DeepMockProxy<BinanceConnectionService>;
  let service: RiskEngineService;

  beforeEach(() => {
    ledger = mockDeep<LedgerService>();
    binanceConnections = mockDeep<BinanceConnectionService>();
    service = new RiskEngineService(ledger, binanceConnections);
  });

  describe('checkPositionRisk (R2 — docs/RISK_RULES.md)', () => {
    it('AC-001: returns OK just below the 2x boundary', async () => {
      ledger.getBorrowPosition.mockResolvedValueOnce(makePositionView({ firstBorrowEntryPrice: '100' }));

      const result = await service.checkPositionRisk('user-a', 'pos-1', { currentPrice: '199' });

      expect(result.status).toBe('OK');
      expect(result.buybackCostEstimateUsdt).toBeNull();
    });

    it('AC-002: returns CRITICAL_REPAY_REQUIRED exactly at the 2x boundary (>=)', async () => {
      ledger.getBorrowPosition.mockResolvedValueOnce(makePositionView({ firstBorrowEntryPrice: '100' }));

      const result = await service.checkPositionRisk('user-a', 'pos-1', { currentPrice: '200' });

      expect(result.status).toBe('CRITICAL_REPAY_REQUIRED');
    });

    it('AC-003/BR-009: buyback cost uses liabilityLedger (outstanding), not the original quantity', async () => {
      ledger.getBorrowPosition.mockResolvedValueOnce(
        makePositionView({ firstBorrowEntryPrice: '100', quantity: '100', liabilityLedger: '60' }),
      );

      const result = await service.checkPositionRisk('user-a', 'pos-1', { currentPrice: '250' });

      expect(result.status).toBe('CRITICAL_REPAY_REQUIRED');
      // 60 (outstanding liability) * 250, NOT 100 (original quantity) * 250.
      expect(result.buybackCostEstimateUsdt).toBe('15000');
    });

    it('rejects currentPrice <= 0', async () => {
      ledger.getBorrowPosition.mockResolvedValueOnce(makePositionView());

      await expect(service.checkPositionRisk('user-a', 'pos-1', { currentPrice: '0' })).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('AC-008: propagates NotFoundException from LedgerService for a position not owned by the caller', async () => {
      ledger.getBorrowPosition.mockRejectedValueOnce(new NotFoundException());

      await expect(service.checkPositionRisk('user-a', 'pos-1', { currentPrice: '200' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getExposureSummary (R1 — docs/RISK_RULES.md)', () => {
    it('AC-005/AC-006: sums initial exposure across OPEN positions and flags OVER_BORROW_CAP only when strictly over', async () => {
      ledger.listBorrowPositions.mockResolvedValueOnce([
        makePositionView({ id: 'pos-a', quantity: '40', firstBorrowEntryPrice: '100' }), // 4,000
        makePositionView({ id: 'pos-b', quantity: '30', firstBorrowEntryPrice: '100' }), // 3,000
      ]);
      binanceConnections.list.mockResolvedValueOnce([{ id: 'conn-1', status: 'VERIFIED' } as never]);
      binanceConnections.getAccountSnapshot.mockResolvedValueOnce({
        fetchedAt: '2026-10-02T00:00:00Z',
        accountType: 'MARGIN_1',
        marginLevel: '999',
        totalAssetOfBtc: '1',
        totalLiabilityOfBtc: '0',
        totalNetAssetOfBtc: '1',
        totalCollateralValueInUSDT: '20000',
        userAssets: [],
      });

      const result = await service.getExposureSummary('user-a');

      expect(result.totalInitialExposureUsdt).toBe('7000');
      expect(result.cap).toBe('6666.6666666666666667');
      expect(result.overCap).toBe(true);
    });

    it('does not flag OVER_BORROW_CAP when exposure exactly equals the cap', async () => {
      ledger.listBorrowPositions.mockResolvedValueOnce([
        makePositionView({ id: 'pos-a', quantity: '100', firstBorrowEntryPrice: '100' }), // 10,000
      ]);
      binanceConnections.list.mockResolvedValueOnce([{ id: 'conn-1', status: 'VERIFIED' } as never]);
      binanceConnections.getAccountSnapshot.mockResolvedValueOnce({
        fetchedAt: '2026-10-02T00:00:00Z',
        accountType: 'MARGIN_1',
        marginLevel: '999',
        totalAssetOfBtc: '1',
        totalLiabilityOfBtc: '0',
        totalNetAssetOfBtc: '1',
        totalCollateralValueInUSDT: '30000', // cap = 10,000 exactly
        userAssets: [],
      });

      const result = await service.getExposureSummary('user-a');

      expect(result.overCap).toBe(false);
    });

    it('AC-007: no VERIFIED connection -> collateral NO_VERIFIED_CONNECTION, cap unavailable (not 0)', async () => {
      ledger.listBorrowPositions.mockResolvedValueOnce([
        makePositionView({ id: 'pos-a', quantity: '10', firstBorrowEntryPrice: '100' }),
      ]);
      binanceConnections.list.mockResolvedValueOnce([]);

      const result = await service.getExposureSummary('user-a');

      expect(result.collateral.status).toBe('NO_VERIFIED_CONNECTION');
      expect(result.cap).toBeNull();
      expect(result.overCap).toBe(false);
      expect(result.capUnavailableReason).not.toBeNull();
    });

    it('distinguishes READ_ERROR (Binance call failed) from NO_VERIFIED_CONNECTION', async () => {
      ledger.listBorrowPositions.mockResolvedValueOnce([]);
      binanceConnections.list.mockResolvedValueOnce([{ id: 'conn-1', status: 'VERIFIED' } as never]);
      binanceConnections.getAccountSnapshot.mockRejectedValueOnce(new Error('timeout'));

      const result = await service.getExposureSummary('user-a');

      expect(result.collateral.status).toBe('READ_ERROR');
      expect(result.cap).toBeNull();
    });

    it('AC-009: excludes REPAID positions from total initial exposure (listBorrowPositions already filters by OPEN)', async () => {
      ledger.listBorrowPositions.mockResolvedValueOnce([]);
      binanceConnections.list.mockResolvedValueOnce([]);

      const result = await service.getExposureSummary('user-a');

      expect(ledger.listBorrowPositions).toHaveBeenCalledWith('user-a', 'OPEN');
      expect(result.totalInitialExposureUsdt).toBe('0');
    });
  });
});
