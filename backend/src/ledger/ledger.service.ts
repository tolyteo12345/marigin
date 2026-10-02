import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { BorrowPosition, AllocationLot, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BinanceConnectionService } from '../binance-connection/binance-connection.service';
import { CreateBorrowPositionDto } from './dto/create-borrow-position.dto';
import { SellAssetDto } from './dto/sell-asset.dto';
import { CreateAllocationLotDto } from './dto/create-allocation-lot.dto';
import { SellLotDto } from './dto/sell-lot.dto';
import { RepayDto } from './dto/repay.dto';
import { CorrectionDto } from './dto/correction.dto';
import { UpdatePersonalCapitalDto } from './dto/update-personal-capital.dto';
import {
  AllocationLotView,
  BorrowPositionView,
  LedgerEventView,
  toAllocationLotView,
  toBorrowPositionView,
  toLedgerEventView,
} from './views';
import { isUniqueViolation } from './unique-violation';

// COND-001b/OQ-C01 resolved 2026-10-01 (user confirmed "ok" on the proposed
// safe default): dust/drift tolerance in native borrowed-asset units is 0
// (exact match). Any non-zero difference is drift; any non-zero remainder
// after REPAY requires its own DUST_WRITTEN_OFF event (never silently
// dropped). Revisit if this produces too many false positives from interest
// accruing between ledger entry and Binance read — see architecture doc.
const DUST_THRESHOLD_NATIVE_UNITS = new Prisma.Decimal(0);

export interface ReconcileResult {
  status: 'MATCHED' | 'DRIFT_DETECTED' | 'RECONCILE_UNKNOWN';
  reason?: string;
  liabilityLedger?: string;
  liabilityBinanceLast?: string;
}

export interface AvailableCapitalView {
  personalCapitalUsdt: string;
  totalReservedUsdt: string;
  freeCapitalUsdt: string;
  asOf: string;
}

@Injectable()
export class LedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly binanceConnections: BinanceConnectionService,
  ) {}

  // ---------------------------------------------------------------------
  // Borrow Position
  // ---------------------------------------------------------------------

  async createBorrowPosition(userId: string, dto: CreateBorrowPositionDto, idempotencyKey: string): Promise<BorrowPositionView> {
    const existing = await this.findEventByIdempotencyKey(userId, idempotencyKey);
    if (existing?.borrowPositionId) {
      return toBorrowPositionView(await this.getOwnedPosition(userId, existing.borrowPositionId));
    }

    const borrowedAsset = dto.borrowedAsset.trim();
    try {
      const position = await this.prisma.$transaction(async (tx) => {
        const created = await tx.borrowPosition.create({
          data: {
            userId,
            borrowedAsset,
            quantity: new Prisma.Decimal(dto.quantity),
            firstBorrowEntryPrice: new Prisma.Decimal(dto.firstBorrowEntryPrice),
            liabilityLedger: new Prisma.Decimal(dto.quantity),
          },
        });
        await tx.ledgerEvent.create({
          data: {
            userId,
            type: 'BORROW_OPENED',
            borrowPositionId: created.id,
            payload: { quantity: dto.quantity, firstBorrowEntryPrice: dto.firstBorrowEntryPrice },
            idempotencyKey,
          },
        });
        return created;
      });
      return toBorrowPositionView(position);
    } catch (err) {
      // Postgres reports the hand-written partial unique index
      // (BorrowPosition_user_asset_open_unique) back to Prisma as a plain
      // column-list violation — "fields: (`userId`,`borrowedAsset`)" — not by
      // index name, the same way it would for a declared @@unique. Match on
      // 'borrowedAsset' (absent from LedgerEvent's idempotency-key conflict)
      // to tell the two apart.
      if (isUniqueViolation(err, 'borrowedAsset')) {
        throw new ConflictException(
          `Bạn đang có khoản vay ${borrowedAsset} chưa trả hết. Phải ghi nhận trả hết khoản vay cũ trước khi mở khoản vay mới cùng tài sản này.`,
        );
      }
      if (isUniqueViolation(err, 'idempotencyKey')) {
        const retry = await this.findEventByIdempotencyKey(userId, idempotencyKey);
        if (retry?.borrowPositionId) {
          return toBorrowPositionView(await this.getOwnedPosition(userId, retry.borrowPositionId));
        }
      }
      throw err;
    }
  }

  async listBorrowPositions(userId: string, status?: string): Promise<BorrowPositionView[]> {
    const positions = await this.prisma.borrowPosition.findMany({
      where: { userId, ...(status ? { status: status as never } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    return positions.map(toBorrowPositionView);
  }

  async getBorrowPosition(userId: string, id: string): Promise<BorrowPositionView> {
    return toBorrowPositionView(await this.getOwnedPosition(userId, id));
  }

  async sellAsset(userId: string, positionId: string, dto: SellAssetDto, idempotencyKey: string): Promise<BorrowPositionView> {
    const existing = await this.findEventByIdempotencyKey(userId, idempotencyKey);
    const position = await this.getOwnedPosition(userId, positionId);
    if (existing) {
      return toBorrowPositionView(position);
    }
    this.assertActionable(position);

    try {
      await this.prisma.ledgerEvent.create({
        data: {
          userId,
          type: 'ASSET_SOLD',
          borrowPositionId: position.id,
          payload: { quantitySold: dto.quantitySold, proceedsUsdt: dto.proceedsUsdt },
          idempotencyKey,
        },
      });
    } catch (err) {
      if (!isUniqueViolation(err, 'idempotencyKey')) {
        throw err;
      }
    }
    return toBorrowPositionView(position);
  }

  async repay(userId: string, positionId: string, dto: RepayDto, idempotencyKey: string): Promise<BorrowPositionView> {
    const existing = await this.findEventByIdempotencyKey(userId, idempotencyKey);
    if (existing) {
      return toBorrowPositionView(await this.getOwnedPosition(userId, positionId));
    }

    const position = await this.getOwnedPosition(userId, positionId);
    this.assertActionable(position);

    const amount = new Prisma.Decimal(dto.amount);
    if (amount.gt(position.liabilityLedger)) {
      throw new UnprocessableEntityException(
        'Số tiền trả vượt quá liability hiện tại. Đây là trường hợp cần xử lý thủ công (MVP chưa hỗ trợ tự động) — vui lòng dùng chức năng Correction.',
      );
    }

    const newLiability = position.liabilityLedger.minus(amount);
    const isRepaid = newLiability.lte(DUST_THRESHOLD_NATIVE_UNITS);

    try {
      await this.prisma.$transaction(async (tx) => {
        const data: Prisma.BorrowPositionUpdateManyMutationInput = {
          liabilityLedger: newLiability,
          version: { increment: 1 },
        };
        if (isRepaid) {
          data.status = 'REPAID';
          data.reservedAmountUsdt = new Prisma.Decimal(0);
          data.repaidAt = new Date();
        }
        const updated = await tx.borrowPosition.updateMany({
          where: { id: position.id, version: position.version },
          data,
        });
        if (updated.count === 0) {
          throw new ConflictException('Dữ liệu đã bị thay đổi bởi một thao tác khác, vui lòng tải lại.');
        }
        await tx.ledgerEvent.create({
          data: {
            userId,
            type: 'REPAY',
            borrowPositionId: position.id,
            payload: { amount: dto.amount, resultingLiability: newLiability.toString() },
            idempotencyKey,
          },
        });
        // Dust > 0 but within tolerance never happens while the tolerance is 0
        // (COND-001b default), but the branch is kept so a future non-zero
        // tolerance doesn't silently drop the write-off record.
        if (isRepaid && !newLiability.isZero()) {
          await tx.ledgerEvent.create({
            data: {
              userId,
              type: 'DUST_WRITTEN_OFF',
              borrowPositionId: position.id,
              payload: { amount: newLiability.toString() },
              idempotencyKey: `${idempotencyKey}:dust`,
            },
          });
        }
      });
    } catch (err) {
      if (!isUniqueViolation(err, 'idempotencyKey')) {
        throw err;
      }
    }
    return toBorrowPositionView(await this.getOwnedPosition(userId, position.id));
  }

  async reconcile(userId: string, positionId: string): Promise<ReconcileResult> {
    const position = await this.getOwnedPosition(userId, positionId);

    const connections = await this.binanceConnections.list(userId);
    const verified = connections.find((c) => c.status === 'VERIFIED');
    if (!verified) {
      return { status: 'RECONCILE_UNKNOWN', reason: 'Chưa có kết nối Binance đã xác minh để đối chiếu.' };
    }

    let snapshot;
    try {
      snapshot = await this.binanceConnections.getAccountSnapshot(userId, verified.id);
    } catch {
      return {
        status: 'RECONCILE_UNKNOWN',
        reason: 'Không thể đối chiếu lúc này (mất kết nối hoặc hết thời gian chờ với Binance), trạng thái khoản vay KHÔNG đổi.',
      };
    }

    const entry = snapshot.userAssets.find((a) => a.asset === position.borrowedAsset);
    // BR-007: liability = principal (borrowed) + interest, exactly as Binance
    // reports them — no re-adding interest on top of a field that already includes it.
    const liabilityBinance = entry ? new Prisma.Decimal(entry.borrowed).plus(entry.interest) : new Prisma.Decimal(0);
    const diff = liabilityBinance.minus(position.liabilityLedger).abs();
    const drift = diff.gt(DUST_THRESHOLD_NATIVE_UNITS);

    const updated = await this.prisma.borrowPosition.updateMany({
      where: { id: position.id, version: position.version },
      data: {
        liabilityBinanceLast: liabilityBinance,
        ...(drift ? { status: 'DRIFT_DETECTED' as const } : {}),
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      throw new ConflictException('Dữ liệu đã bị thay đổi bởi một thao tác khác, vui lòng tải lại.');
    }

    return {
      status: drift ? 'DRIFT_DETECTED' : 'MATCHED',
      liabilityLedger: position.liabilityLedger.toString(),
      liabilityBinanceLast: liabilityBinance.toString(),
    };
  }

  // ---------------------------------------------------------------------
  // Allocation Lot
  // ---------------------------------------------------------------------

  async createAllocationLot(userId: string, dto: CreateAllocationLotDto, idempotencyKey: string): Promise<AllocationLotView> {
    const existing = await this.findEventByIdempotencyKey(userId, idempotencyKey);
    if (existing?.allocationLotId) {
      return toAllocationLotView(await this.getOwnedLot(userId, existing.allocationLotId));
    }

    // BR-003: exactly one funding source, enforced server-side regardless of
    // what the client sends (the UI never offers a way to pick both).
    if (dto.fundingSource === 'BORROW') {
      if (!dto.fundingBorrowPositionId) {
        throw new UnprocessableEntityException('fundingBorrowPositionId bắt buộc khi fundingSource=BORROW.');
      }
      const position = await this.getOwnedPosition(userId, dto.fundingBorrowPositionId);
      // BR-009: DRIFT_DETECTED uses the same 409 lock as sell-asset/repay/sell-lot
      // (architecture.md "API contracts và state machines" — all 3 actions that
      // would use a DRIFT_DETECTED position as source share one lock mechanism).
      // A merely-REPAID source is a different, non-recoverable-by-correction
      // case, kept as 422.
      if (position.status === 'DRIFT_DETECTED') {
        this.assertActionable(position);
      }
      if (position.status !== 'OPEN') {
        throw new UnprocessableEntityException('Borrow Position nguồn phải đang ở trạng thái OPEN.');
      }
    } else if (dto.fundingBorrowPositionId) {
      throw new UnprocessableEntityException(
        'Không thể ghi nhận: 1 lot chỉ được gắn với đúng 1 nguồn vốn. fundingBorrowPositionId chỉ dùng khi fundingSource=BORROW.',
      );
    }

    try {
      const lot = await this.prisma.$transaction(async (tx) => {
        const created = await tx.allocationLot.create({
          data: {
            userId,
            asset: dto.asset,
            quantity: new Prisma.Decimal(dto.quantity),
            remainingQuantity: new Prisma.Decimal(dto.quantity),
            costBasisUsdt: new Prisma.Decimal(dto.costBasisUsdt),
            fundingSource: dto.fundingSource,
            fundingBorrowPositionId: dto.fundingSource === 'BORROW' ? dto.fundingBorrowPositionId : null,
          },
        });
        await tx.ledgerEvent.create({
          data: {
            userId,
            type: 'ASSET_BOUGHT',
            allocationLotId: created.id,
            borrowPositionId: created.fundingBorrowPositionId,
            payload: { ...dto },
            idempotencyKey,
          },
        });
        return created;
      });
      return toAllocationLotView(lot);
    } catch (err) {
      if (isUniqueViolation(err, 'idempotencyKey')) {
        const retry = await this.findEventByIdempotencyKey(userId, idempotencyKey);
        if (retry?.allocationLotId) {
          return toAllocationLotView(await this.getOwnedLot(userId, retry.allocationLotId));
        }
      }
      throw err;
    }
  }

  async listAllocationLots(userId: string, fundingBorrowPositionId?: string): Promise<AllocationLotView[]> {
    const lots = await this.prisma.allocationLot.findMany({
      where: { userId, ...(fundingBorrowPositionId ? { fundingBorrowPositionId } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    return lots.map(toAllocationLotView);
  }

  async sellLot(userId: string, lotId: string, dto: SellLotDto, idempotencyKey: string): Promise<AllocationLotView> {
    const existing = await this.findEventByIdempotencyKey(userId, idempotencyKey);
    if (existing) {
      return toAllocationLotView(await this.getOwnedLot(userId, lotId));
    }

    const lot = await this.getOwnedLot(userId, lotId);
    const quantitySold = new Prisma.Decimal(dto.quantitySold);
    if (quantitySold.gt(lot.remainingQuantity)) {
      throw new UnprocessableEntityException(`Số lượng bán vượt quá số lượng còn lại (${lot.remainingQuantity.toString()}).`);
    }

    let fundingPosition: BorrowPosition | null = null;
    if (lot.fundingBorrowPositionId) {
      fundingPosition = await this.getOwnedPosition(userId, lot.fundingBorrowPositionId);
      this.assertActionable(fundingPosition);
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const lotUpdate = await tx.allocationLot.updateMany({
          where: { id: lot.id, version: lot.version },
          data: { remainingQuantity: lot.remainingQuantity.minus(quantitySold), version: { increment: 1 } },
        });
        if (lotUpdate.count === 0) {
          throw new ConflictException('Dữ liệu đã bị thay đổi bởi một thao tác khác, vui lòng tải lại.');
        }

        if (fundingPosition) {
          // BR-005: 100% of proceeds for a borrow-funded lot's disposal is reserved.
          const positionUpdate = await tx.borrowPosition.updateMany({
            where: { id: fundingPosition.id, version: fundingPosition.version },
            data: {
              reservedAmountUsdt: fundingPosition.reservedAmountUsdt.plus(dto.proceedsUsdt),
              version: { increment: 1 },
            },
          });
          if (positionUpdate.count === 0) {
            throw new ConflictException('Dữ liệu đã bị thay đổi bởi một thao tác khác, vui lòng tải lại.');
          }
        }

        await tx.ledgerEvent.create({
          data: {
            userId,
            type: 'LOT_SOLD',
            allocationLotId: lot.id,
            borrowPositionId: fundingPosition?.id,
            payload: { quantitySold: dto.quantitySold, proceedsUsdt: dto.proceedsUsdt },
            idempotencyKey,
          },
        });
      });
    } catch (err) {
      if (!isUniqueViolation(err, 'idempotencyKey')) {
        throw err;
      }
    }
    return toAllocationLotView(await this.getOwnedLot(userId, lot.id));
  }

  // ---------------------------------------------------------------------
  // Correction (OQ-P05 / COND-004 catch-all: manual, explicit, audited)
  // ---------------------------------------------------------------------

  async correct(userId: string, targetEventId: string, dto: CorrectionDto, idempotencyKey: string): Promise<LedgerEventView> {
    const existing = await this.findEventByIdempotencyKey(userId, idempotencyKey);
    if (existing) {
      return toLedgerEventView(existing);
    }

    const target = await this.prisma.ledgerEvent.findFirst({ where: { id: targetEventId, userId } });
    if (!target) {
      throw new NotFoundException();
    }
    if (!dto.borrowPositionId && !dto.allocationLotId) {
      throw new UnprocessableEntityException('Correction phải chỉ định borrowPositionId và/hoặc allocationLotId cần điều chỉnh.');
    }

    const before: Record<string, string> = {};
    const after: Record<string, string> = {};

    const event = await this.prisma.$transaction(async (tx) => {
      if (dto.borrowPositionId) {
        const position = await this.getOwnedPositionTx(tx, userId, dto.borrowPositionId);
        const data: Prisma.BorrowPositionUpdateManyMutationInput = { version: { increment: 1 } };
        if (dto.newLiabilityLedger !== undefined) {
          before.liabilityLedger = position.liabilityLedger.toString();
          after.liabilityLedger = dto.newLiabilityLedger;
          data.liabilityLedger = new Prisma.Decimal(dto.newLiabilityLedger);
        }
        if (dto.newReservedAmountUsdt !== undefined) {
          before.reservedAmountUsdt = position.reservedAmountUsdt.toString();
          after.reservedAmountUsdt = dto.newReservedAmountUsdt;
          data.reservedAmountUsdt = new Prisma.Decimal(dto.newReservedAmountUsdt);
        }
        // A correction is the one explicit, audited way to clear
        // DRIFT_DETECTED back to OPEN (architecture state machine — "user xác
        // nhận đã xử lý"); reconcile() itself never clears it automatically.
        if (position.status === 'DRIFT_DETECTED') {
          data.status = 'OPEN';
        }
        const updated = await tx.borrowPosition.updateMany({ where: { id: position.id, version: position.version }, data });
        if (updated.count === 0) {
          throw new ConflictException('Dữ liệu đã bị thay đổi bởi một thao tác khác, vui lòng tải lại.');
        }
      }

      if (dto.allocationLotId) {
        const lot = await this.getOwnedLotTx(tx, userId, dto.allocationLotId);
        const data: Prisma.AllocationLotUpdateManyMutationInput = { version: { increment: 1 } };
        if (dto.newRemainingQuantity !== undefined) {
          before.remainingQuantity = lot.remainingQuantity.toString();
          after.remainingQuantity = dto.newRemainingQuantity;
          data.remainingQuantity = new Prisma.Decimal(dto.newRemainingQuantity);
        }
        const updated = await tx.allocationLot.updateMany({ where: { id: lot.id, version: lot.version }, data });
        if (updated.count === 0) {
          throw new ConflictException('Dữ liệu đã bị thay đổi bởi một thao tác khác, vui lòng tải lại.');
        }
      }

      return tx.ledgerEvent.create({
        data: {
          userId,
          type: 'CORRECTION',
          correctsEventId: target.id,
          borrowPositionId: dto.borrowPositionId,
          allocationLotId: dto.allocationLotId,
          payload: { reason: dto.reason, before, after },
          idempotencyKey,
        },
      });
    });

    return toLedgerEventView(event);
  }

  async listEvents(userId: string, filter: { borrowPositionId?: string; allocationLotId?: string }): Promise<LedgerEventView[]> {
    const events = await this.prisma.ledgerEvent.findMany({
      where: { userId, ...filter },
      orderBy: { createdAt: 'asc' },
    });
    return events.map(toLedgerEventView);
  }

  // ---------------------------------------------------------------------
  // Available capital
  // ---------------------------------------------------------------------

  async getAvailableCapital(userId: string): Promise<AvailableCapitalView> {
    const [personal, reservedAgg] = await Promise.all([
      this.prisma.personalCapitalDeclaration.findUnique({ where: { userId } }),
      this.prisma.borrowPosition.aggregate({
        where: { userId, status: { in: ['OPEN', 'DRIFT_DETECTED'] } },
        _sum: { reservedAmountUsdt: true },
      }),
    ]);
    const personalCapitalUsdt = personal?.amountUsdt ?? new Prisma.Decimal(0);
    const totalReservedUsdt = reservedAgg._sum.reservedAmountUsdt ?? new Prisma.Decimal(0);
    return {
      personalCapitalUsdt: personalCapitalUsdt.toString(),
      totalReservedUsdt: totalReservedUsdt.toString(),
      freeCapitalUsdt: personalCapitalUsdt.minus(totalReservedUsdt).toString(),
      asOf: new Date().toISOString(),
    };
  }

  async updatePersonalCapital(userId: string, dto: UpdatePersonalCapitalDto): Promise<{ personalCapitalUsdt: string }> {
    const updated = await this.prisma.personalCapitalDeclaration.upsert({
      where: { userId },
      create: { userId, amountUsdt: new Prisma.Decimal(dto.amountUsdt) },
      update: { amountUsdt: new Prisma.Decimal(dto.amountUsdt) },
    });
    return { personalCapitalUsdt: updated.amountUsdt.toString() };
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  private findEventByIdempotencyKey(userId: string, idempotencyKey: string) {
    return this.prisma.ledgerEvent.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey } } });
  }

  // Ownership guard: 404 either way, never distinguishing "not found" from
  // "not yours" — same anti-IDOR pattern as binance-read-only-connection.
  private async getOwnedPosition(userId: string, id: string): Promise<BorrowPosition> {
    const position = await this.prisma.borrowPosition.findFirst({ where: { id, userId } });
    if (!position) {
      throw new NotFoundException();
    }
    return position;
  }

  private async getOwnedPositionTx(tx: Prisma.TransactionClient, userId: string, id: string): Promise<BorrowPosition> {
    const position = await tx.borrowPosition.findFirst({ where: { id, userId } });
    if (!position) {
      throw new NotFoundException();
    }
    return position;
  }

  private async getOwnedLot(userId: string, id: string): Promise<AllocationLot> {
    const lot = await this.prisma.allocationLot.findFirst({ where: { id, userId } });
    if (!lot) {
      throw new NotFoundException();
    }
    return lot;
  }

  private async getOwnedLotTx(tx: Prisma.TransactionClient, userId: string, id: string): Promise<AllocationLot> {
    const lot = await tx.allocationLot.findFirst({ where: { id, userId } });
    if (!lot) {
      throw new NotFoundException();
    }
    return lot;
  }

  // BR-009: DRIFT_DETECTED blocks every action that would change liability/
  // reserved amounts on the position, until a correction clears it.
  private assertActionable(position: BorrowPosition): void {
    if (position.status === 'DRIFT_DETECTED') {
      throw new ConflictException(
        'Khoản vay đang ở trạng thái lệch số liệu (DRIFT_DETECTED). Thao tác bị khoá cho tới khi xử lý xong qua Correction.',
      );
    }
    if (position.status === 'REPAID') {
      throw new ForbiddenException('Khoản vay đã trả hết, không thể ghi nhận thêm sự kiện mới.');
    }
  }
}
