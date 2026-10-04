import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LedgerService } from '../ledger/ledger.service';
import { BinanceConnectionService } from '../binance-connection/binance-connection.service';
import { CheckPositionRiskDto } from './dto/check-position-risk.dto';
import { CollateralView, ExposureSummaryView, PositionRiskCheckView } from './views';

// COND-001 (architecture/risk-engine.md): fixed wording, shown by the
// frontend verbatim, so every screen stays in sync with what the figure
// actually is (Binance's own field, not a product-verified valuation).
const COLLATERAL_DISCLAIMER =
  'Collateral value (USDT) — theo Binance totalCollateralValueInUSDT, ước lượng chưa verify bằng API thật.';

@Injectable()
export class RiskEngineService {
  constructor(
    private readonly ledger: LedgerService,
    private readonly binanceConnections: BinanceConnectionService,
  ) {}

  // R1 (docs/RISK_RULES.md) — informational only, nothing to "block" here:
  // this app has no auto-borrow to gate (see requirements/risk-engine.md Non-goals).
  async getExposureSummary(userId: string): Promise<ExposureSummaryView> {
    // Independent lookups (DB vs Binance) — run concurrently instead of
    // paying their latencies back-to-back.
    const [openPositions, collateral] = await Promise.all([
      this.ledger.listBorrowPositions(userId, 'OPEN'),
      this.resolveCollateralProxy(userId),
    ]);

    const positions = openPositions.map((p) => ({
      id: p.id,
      borrowedAsset: p.borrowedAsset,
      quantity: p.quantity,
      firstBorrowEntryPrice: p.firstBorrowEntryPrice,
      initialExposureUsdt: new Prisma.Decimal(p.quantity).times(p.firstBorrowEntryPrice).toString(),
    }));

    const totalInitialExposureUsdt = positions.reduce(
      (sum, p) => sum.plus(p.initialExposureUsdt),
      new Prisma.Decimal(0),
    );

    let cap: string | null = null;
    let overCap = false;
    let capUnavailableReason: string | null = null;
    if (collateral.status === 'OK' && collateral.value !== null) {
      const capDecimal = new Prisma.Decimal(collateral.value).dividedBy(3);
      cap = capDecimal.toString();
      // R1: "bằng cap được phép" — strictly greater-than only (docs/RISK_RULES.md).
      overCap = totalInitialExposureUsdt.greaterThan(capDecimal);
    } else {
      // Unknown must never silently read as "under cap" (AGENTS.md: timeout
      // is not success or failure) — surface a reason, leave overCap=false
      // but let the frontend branch on capUnavailableReason instead.
      capUnavailableReason =
        collateral.status === 'NO_VERIFIED_CONNECTION'
          ? 'Chưa có kết nối Binance đã verify — không thể tính cap.'
          : `Không thể đọc dữ liệu Binance để tính cap${collateral.errorMessage ? ` (${collateral.errorMessage})` : ''}.`;
    }

    return {
      positions,
      totalInitialExposureUsdt: totalInitialExposureUsdt.toString(),
      collateral,
      cap,
      overCap,
      capUnavailableReason,
    };
  }

  // R2 (docs/RISK_RULES.md) — stateless: currentPrice is never persisted (BR-003).
  async checkPositionRisk(userId: string, positionId: string, dto: CheckPositionRiskDto): Promise<PositionRiskCheckView> {
    // getBorrowPosition throws NotFoundException (404) when the position
    // doesn't belong to userId — same ownership/IDOR guard as the rest of
    // LedgerModule, reused as-is (AC-008).
    const position = await this.ledger.getBorrowPosition(userId, positionId);

    const currentPrice = new Prisma.Decimal(dto.currentPrice);
    if (currentPrice.lessThanOrEqualTo(0)) {
      throw new UnprocessableEntityException('currentPrice phải lớn hơn 0.');
    }

    const threshold = new Prisma.Decimal(position.firstBorrowEntryPrice).times(2);
    const isCritical = currentPrice.greaterThanOrEqualTo(threshold); // R2 boundary is ">=" (BR-002)
    const buybackCostEstimateUsdt = isCritical
      ? new Prisma.Decimal(position.liabilityLedger).times(currentPrice).toString()
      : null;

    return {
      positionId: position.id,
      positionStatus: position.status,
      status: isCritical ? 'CRITICAL_REPAY_REQUIRED' : 'OK',
      firstBorrowEntryPrice: position.firstBorrowEntryPrice,
      currentPrice: dto.currentPrice,
      liabilityLedger: position.liabilityLedger,
      borrowedAsset: position.borrowedAsset,
      buybackCostEstimateUsdt,
      checkedAt: new Date().toISOString(),
    };
  }

  // COND-003 (architecture/risk-engine.md): mirrors LedgerService.reconcile()
  // — pick the first VERIFIED connection from the list, no cross-account sum.
  // Interim implementation choice, not an approved multi-account policy (OQ-RE03).
  private async resolveCollateralProxy(userId: string): Promise<CollateralView> {
    const connections = await this.binanceConnections.list(userId);
    const verified = connections.find((c) => c.status === 'VERIFIED');
    if (!verified) {
      return {
        status: 'NO_VERIFIED_CONNECTION',
        value: null,
        fetchedAt: null,
        sourceConnectionId: null,
        errorMessage: null,
        disclaimer: COLLATERAL_DISCLAIMER,
      };
    }

    try {
      const snapshot = await this.binanceConnections.getAccountSnapshot(userId, verified.id);
      return {
        status: 'OK',
        value: snapshot.totalCollateralValueInUSDT,
        fetchedAt: snapshot.fetchedAt,
        sourceConnectionId: verified.id,
        errorMessage: null,
        disclaimer: COLLATERAL_DISCLAIMER,
      };
    } catch (err) {
      // READ_ERROR must stay distinguishable from NO_VERIFIED_CONNECTION —
      // "chưa đọc được" ≠ "collateral = 0" (requirement Edge cases).
      return {
        status: 'READ_ERROR',
        value: null,
        fetchedAt: null,
        sourceConnectionId: verified.id,
        errorMessage: (err as Error).message,
        disclaimer: COLLATERAL_DISCLAIMER,
      };
    }
  }
}
