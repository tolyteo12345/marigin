import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { Prisma, BorrowPosition, AllocationLot, LedgerEvent } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { BinanceConnectionService } from '../src/binance-connection/binance-connection.service';
import { LedgerService } from '../src/ledger/ledger.service';

function p2002(target: string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '5.22.0',
    meta: { target },
  });
}

function makePosition(overrides: Partial<BorrowPosition> = {}): BorrowPosition {
  return {
    id: 'pos-1',
    userId: 'user-a',
    borrowedAsset: 'ZEC',
    quantity: new Prisma.Decimal('25.1'),
    firstBorrowEntryPrice: new Prisma.Decimal('420'),
    liabilityLedger: new Prisma.Decimal('25.1'),
    liabilityBinanceLast: null,
    reservedAmountUsdt: new Prisma.Decimal('0'),
    status: 'OPEN',
    version: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    repaidAt: null,
    ...overrides,
  };
}

function makeLot(overrides: Partial<AllocationLot> = {}): AllocationLot {
  return {
    id: 'lot-1',
    userId: 'user-a',
    asset: 'BTC',
    quantity: new Prisma.Decimal('0.15'),
    remainingQuantity: new Prisma.Decimal('0.15'),
    costBasisUsdt: new Prisma.Decimal('6000'),
    fundingSource: 'BORROW',
    fundingBorrowPositionId: 'pos-1',
    version: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('LedgerService', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let binanceConnections: DeepMockProxy<BinanceConnectionService>;
  let service: LedgerService;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    binanceConnections = mockDeep<BinanceConnectionService>();
    (prisma.$transaction as unknown as jest.Mock).mockImplementation((cb: (tx: PrismaService) => unknown) => cb(prisma));
    service = new LedgerService(prisma, binanceConnections);
  });

  describe('createBorrowPosition (BR-002, AC-001, AC-002)', () => {
    it('AC-001: creates an OPEN position and a BORROW_OPENED event', async () => {
      prisma.ledgerEvent.findUnique.mockResolvedValueOnce(null);
      prisma.borrowPosition.create.mockResolvedValueOnce(makePosition());

      const result = await service.createBorrowPosition(
        'user-a',
        { borrowedAsset: 'ZEC', quantity: '25.1', firstBorrowEntryPrice: '420' },
        'idem-1',
      );

      expect(result.status).toBe('OPEN');
      expect(prisma.ledgerEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'BORROW_OPENED', idempotencyKey: 'idem-1' }) }),
      );
    });

    it('AC-002: rejects a 2nd OPEN position for the same (user, asset) via the partial unique index', async () => {
      prisma.ledgerEvent.findUnique.mockResolvedValueOnce(null);
      // Real Postgres behavior (confirmed via manual smoke test against the
      // hand-written partial unique index): Prisma reports it by column list,
      // not by index name — see the comment on isUniqueViolation call site.
      prisma.borrowPosition.create.mockRejectedValueOnce(p2002(['userId', 'borrowedAsset']));

      await expect(
        service.createBorrowPosition('user-a', { borrowedAsset: 'ZEC', quantity: '1', firstBorrowEntryPrice: '1' }, 'idem-2'),
      ).rejects.toThrow(ConflictException);
    });

    it('COND-002: replays an already-processed idempotency key instead of creating a duplicate', async () => {
      prisma.ledgerEvent.findUnique.mockResolvedValueOnce({ borrowPositionId: 'pos-1' } as LedgerEvent);
      prisma.borrowPosition.findFirst.mockResolvedValueOnce(makePosition());

      const result = await service.createBorrowPosition(
        'user-a',
        { borrowedAsset: 'ZEC', quantity: '25.1', firstBorrowEntryPrice: '420' },
        'idem-1',
      );

      expect(result.id).toBe('pos-1');
      expect(prisma.borrowPosition.create).not.toHaveBeenCalled();
    });
  });

  describe('createAllocationLot (BR-003, AC-003, AC-004)', () => {
    it('AC-004: rejects BORROW funding without fundingBorrowPositionId', async () => {
      prisma.ledgerEvent.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.createAllocationLot(
          'user-a',
          { asset: 'BTC', quantity: '0.1', costBasisUsdt: '4000', fundingSource: 'BORROW' },
          'idem-3',
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('rejects funding from a REPAID Borrow Position with 422 (terminal, not recoverable via correction)', async () => {
      prisma.ledgerEvent.findUnique.mockResolvedValueOnce(null);
      prisma.borrowPosition.findFirst.mockResolvedValueOnce(makePosition({ status: 'REPAID' }));

      await expect(
        service.createAllocationLot(
          'user-a',
          { asset: 'BTC', quantity: '0.1', costBasisUsdt: '4000', fundingSource: 'BORROW', fundingBorrowPositionId: 'pos-1' },
          'idem-4',
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('BR-009: rejects funding from a DRIFT_DETECTED Borrow Position with 409, same lock as sell-asset/repay/sell-lot', async () => {
      prisma.ledgerEvent.findUnique.mockResolvedValueOnce(null);
      prisma.borrowPosition.findFirst.mockResolvedValueOnce(makePosition({ status: 'DRIFT_DETECTED' }));

      await expect(
        service.createAllocationLot(
          'user-a',
          { asset: 'BTC', quantity: '0.1', costBasisUsdt: '4000', fundingSource: 'BORROW', fundingBorrowPositionId: 'pos-1' },
          'idem-4b',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('AC-003: creates a lot with a single funding source', async () => {
      prisma.ledgerEvent.findUnique.mockResolvedValueOnce(null);
      prisma.borrowPosition.findFirst.mockResolvedValueOnce(makePosition());
      prisma.allocationLot.create.mockResolvedValueOnce(makeLot());

      const result = await service.createAllocationLot(
        'user-a',
        { asset: 'BTC', quantity: '0.15', costBasisUsdt: '6000', fundingSource: 'BORROW', fundingBorrowPositionId: 'pos-1' },
        'idem-5',
      );

      expect(result.fundingBorrowPositionId).toBe('pos-1');
    });
  });

  describe('sellLot (BR-005, BR-009, AC-005)', () => {
    it('rejects selling more than remainingQuantity', async () => {
      prisma.ledgerEvent.findUnique.mockResolvedValueOnce(null);
      prisma.allocationLot.findFirst.mockResolvedValueOnce(makeLot({ remainingQuantity: new Prisma.Decimal('0.05') }));

      await expect(service.sellLot('user-a', 'lot-1', { quantitySold: '0.1', proceedsUsdt: '100' }, 'idem-6')).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('BR-009: blocks selling a lot funded by a DRIFT_DETECTED position', async () => {
      prisma.ledgerEvent.findUnique.mockResolvedValueOnce(null);
      prisma.allocationLot.findFirst.mockResolvedValueOnce(makeLot());
      prisma.borrowPosition.findFirst.mockResolvedValueOnce(makePosition({ status: 'DRIFT_DETECTED' }));

      await expect(service.sellLot('user-a', 'lot-1', { quantitySold: '0.05', proceedsUsdt: '3500' }, 'idem-7')).rejects.toThrow(
        ConflictException,
      );
    });

    it('BR-005: reserves 100% of proceeds on the funding Borrow Position', async () => {
      prisma.ledgerEvent.findUnique.mockResolvedValueOnce(null);
      prisma.allocationLot.findFirst.mockResolvedValueOnce(makeLot());
      prisma.borrowPosition.findFirst.mockResolvedValueOnce(makePosition());
      prisma.allocationLot.updateMany.mockResolvedValueOnce({ count: 1 });
      prisma.borrowPosition.updateMany.mockResolvedValueOnce({ count: 1 });
      prisma.allocationLot.findFirst.mockResolvedValueOnce(
        makeLot({ remainingQuantity: new Prisma.Decimal('0.075'), version: 1 }),
      );

      await service.sellLot('user-a', 'lot-1', { quantitySold: '0.075', proceedsUsdt: '3500' }, 'idem-8');

      expect(prisma.borrowPosition.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pos-1', version: 0 },
          data: expect.objectContaining({ reservedAmountUsdt: expect.objectContaining({}) }),
        }),
      );
      const call = prisma.borrowPosition.updateMany.mock.calls[0][0] as { data: { reservedAmountUsdt: Prisma.Decimal } };
      expect(call.data.reservedAmountUsdt.toString()).toBe('3500');
    });

    it('raises a conflict when another request already changed the lot (optimistic lock)', async () => {
      prisma.ledgerEvent.findUnique.mockResolvedValueOnce(null);
      prisma.allocationLot.findFirst.mockResolvedValueOnce(makeLot({ fundingBorrowPositionId: null, fundingSource: 'PERSONAL' }));
      prisma.allocationLot.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.sellLot('user-a', 'lot-1', { quantitySold: '0.05', proceedsUsdt: '2000' }, 'idem-9')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('repay (BR-006, COND-004/OQ-P05, AC-006, AC-011)', () => {
    it('OQ-P05: rejects overpayment instead of silently clamping', async () => {
      prisma.ledgerEvent.findUnique.mockResolvedValueOnce(null);
      prisma.borrowPosition.findFirst.mockResolvedValueOnce(makePosition({ liabilityLedger: new Prisma.Decimal('10') }));

      await expect(service.repay('user-a', 'pos-1', { amount: '11' }, 'idem-10')).rejects.toThrow(UnprocessableEntityException);
    });

    it('BR-006: paying off the full liability closes the position and releases reservedAmountUsdt', async () => {
      prisma.ledgerEvent.findUnique.mockResolvedValueOnce(null);
      prisma.borrowPosition.findFirst
        .mockResolvedValueOnce(makePosition({ liabilityLedger: new Prisma.Decimal('25.1'), reservedAmountUsdt: new Prisma.Decimal('8000') }))
        .mockResolvedValueOnce(makePosition({ status: 'REPAID', liabilityLedger: new Prisma.Decimal('0'), reservedAmountUsdt: new Prisma.Decimal('0') }));
      prisma.borrowPosition.updateMany.mockResolvedValueOnce({ count: 1 });

      const result = await service.repay('user-a', 'pos-1', { amount: '25.1' }, 'idem-11');

      expect(result.status).toBe('REPAID');
      const call = prisma.borrowPosition.updateMany.mock.calls[0][0] as { data: { status?: string; reservedAmountUsdt?: Prisma.Decimal } };
      expect(call.data.status).toBe('REPAID');
      expect(call.data.reservedAmountUsdt?.toString()).toBe('0');
    });

    it('blocks repay on a DRIFT_DETECTED position', async () => {
      prisma.ledgerEvent.findUnique.mockResolvedValueOnce(null);
      prisma.borrowPosition.findFirst.mockResolvedValueOnce(makePosition({ status: 'DRIFT_DETECTED' }));

      await expect(service.repay('user-a', 'pos-1', { amount: '1' }, 'idem-12')).rejects.toThrow(ConflictException);
    });

    it('blocks further events once REPAID', async () => {
      prisma.ledgerEvent.findUnique.mockResolvedValueOnce(null);
      prisma.borrowPosition.findFirst.mockResolvedValueOnce(makePosition({ status: 'REPAID' }));

      await expect(service.repay('user-a', 'pos-1', { amount: '1' }, 'idem-13')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('reconcile (BR-009, AC-007)', () => {
    it('returns RECONCILE_UNKNOWN (not a failure/success verdict) when there is no verified connection', async () => {
      prisma.borrowPosition.findFirst.mockResolvedValueOnce(makePosition());
      binanceConnections.list.mockResolvedValueOnce([]);

      const result = await service.reconcile('user-a', 'pos-1');

      expect(result.status).toBe('RECONCILE_UNKNOWN');
    });

    it('flags DRIFT_DETECTED when Binance liability differs from the ledger', async () => {
      prisma.borrowPosition.findFirst.mockResolvedValueOnce(makePosition({ liabilityLedger: new Prisma.Decimal('25.1') }));
      binanceConnections.list.mockResolvedValueOnce([{ id: 'conn-1', status: 'VERIFIED' } as never]);
      binanceConnections.getAccountSnapshot.mockResolvedValueOnce({
        fetchedAt: new Date().toISOString(),
        accountType: 'MARGIN_1',
        marginLevel: '999',
        totalAssetOfBtc: '1',
        totalLiabilityOfBtc: '0',
        totalNetAssetOfBtc: '1',
        totalCollateralValueInUSDT: '1',
        userAssets: [{ asset: 'ZEC', borrowed: '25.3', free: '0', interest: '0', locked: '0', netAsset: '0' }],
      });
      prisma.borrowPosition.updateMany.mockResolvedValueOnce({ count: 1 });

      const result = await service.reconcile('user-a', 'pos-1');

      expect(result.status).toBe('DRIFT_DETECTED');
      const call = prisma.borrowPosition.updateMany.mock.calls[0][0] as { data: { status?: string } };
      expect(call.data.status).toBe('DRIFT_DETECTED');
    });

    it('does not change status on timeout/error (AGENTS.md: timeout != failure)', async () => {
      prisma.borrowPosition.findFirst.mockResolvedValueOnce(makePosition());
      binanceConnections.list.mockResolvedValueOnce([{ id: 'conn-1', status: 'VERIFIED' } as never]);
      binanceConnections.getAccountSnapshot.mockRejectedValueOnce(new Error('timeout'));

      const result = await service.reconcile('user-a', 'pos-1');

      expect(result.status).toBe('RECONCILE_UNKNOWN');
      expect(prisma.borrowPosition.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('ownership (AC-010)', () => {
    it('throws NotFoundException for a position belonging to another user', async () => {
      prisma.borrowPosition.findFirst.mockResolvedValueOnce(null);

      await expect(service.getBorrowPosition('user-b', 'pos-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('correct (AC-008, COND-004)', () => {
    it('creates a CORRECTION event and clears DRIFT_DETECTED back to OPEN without touching the original event', async () => {
      prisma.ledgerEvent.findUnique.mockResolvedValueOnce(null);
      prisma.ledgerEvent.findFirst.mockResolvedValueOnce({ id: 'evt-1', userId: 'user-a' } as LedgerEvent);
      prisma.borrowPosition.findFirst.mockResolvedValueOnce(makePosition({ status: 'DRIFT_DETECTED' }));
      prisma.borrowPosition.updateMany.mockResolvedValueOnce({ count: 1 });
      prisma.ledgerEvent.create.mockResolvedValueOnce({
        id: 'evt-2',
        userId: 'user-a',
        type: 'CORRECTION',
        borrowPositionId: 'pos-1',
        allocationLotId: null,
        payload: {},
        correctsEventId: 'evt-1',
        idempotencyKey: 'idem-14',
        createdAt: new Date(),
      });

      const result = await service.correct(
        'user-a',
        'evt-1',
        { reason: 'đã xử lý thủ công trên Binance', borrowPositionId: 'pos-1', newLiabilityLedger: '25.1' },
        'idem-14',
      );

      expect(result.correctsEventId).toBe('evt-1');
      const call = prisma.borrowPosition.updateMany.mock.calls[0][0] as { data: { status?: string } };
      expect(call.data.status).toBe('OPEN');
    });
  });
});
