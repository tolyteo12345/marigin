import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CapitalProvenanceLedgerPage } from './CapitalProvenanceLedgerPage';

interface Route {
  method: string;
  test: (url: string) => boolean;
  handler: () => Response | Promise<Response>;
}

function mockApi(routes: Route[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      const route = routes.find((r) => r.method === method && r.test(url));
      if (!route) {
        throw new Error(`Unexpected fetch call: ${method} ${url}`);
      }
      return route.handler();
    }),
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

const csrfRoute: Route = {
  method: 'GET',
  test: (url) => url.endsWith('/api/auth/csrf-token'),
  handler: () => json({ csrfToken: 'test-csrf-token' }),
};

const availableCapitalRoute = (overrides: Partial<Record<string, string>> = {}): Route => ({
  method: 'GET',
  test: (url) => url.endsWith('/api/ledger/available-capital'),
  handler: () =>
    json({
      personalCapitalUsdt: '0',
      totalReservedUsdt: '0',
      freeCapitalUsdt: '0',
      asOf: '2026-01-01T00:00:00Z',
      ...overrides,
    }),
});

function emptyAllocationLotsRoute(): Route {
  return { method: 'GET', test: (url) => url.includes('/api/ledger/allocation-lots'), handler: () => json([]) };
}

function exposureSummaryRoute(overrides: Partial<Record<string, unknown>> = {}): Route {
  return {
    method: 'GET',
    test: (url) => url.endsWith('/api/risk-engine/exposure-summary'),
    handler: () =>
      json({
        positions: [],
        totalInitialExposureUsdt: '0',
        collateral: {
          status: 'NO_VERIFIED_CONNECTION',
          value: null,
          fetchedAt: null,
          sourceConnectionId: null,
          errorMessage: null,
          disclaimer: 'Collateral value (USDT) — theo Binance totalCollateralValueInUSDT, ước lượng chưa verify bằng API thật.',
        },
        cap: null,
        overCap: false,
        capUnavailableReason: 'Chưa có kết nối Binance đã verify — không thể tính cap.',
        ...overrides,
      }),
  };
}

const position = {
  id: 'pos-1',
  borrowedAsset: 'ZEC',
  quantity: '25.1',
  firstBorrowEntryPrice: '420',
  liabilityLedger: '25.1',
  liabilityBinanceLast: null,
  reservedAmountUsdt: '0',
  status: 'OPEN',
  version: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  repaidAt: null,
};

describe('CapitalProvenanceLedgerPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the empty state when there are no borrow positions', async () => {
    mockApi([
      csrfRoute,
      availableCapitalRoute(),
      exposureSummaryRoute(),
      { method: 'GET', test: (url) => url.endsWith('/api/ledger/borrow-positions'), handler: () => json([]) },
      emptyAllocationLotsRoute(),
    ]);

    render(<CapitalProvenanceLedgerPage />);

    expect(await screen.findByText('Chưa có khoản vay nào được ghi nhận.')).toBeInTheDocument();
  });

  it('creating a borrow position adds a card showing its liability (US-001, AC-001)', async () => {
    mockApi([
      csrfRoute,
      availableCapitalRoute(),
      exposureSummaryRoute(),
      { method: 'GET', test: (url) => url.endsWith('/api/ledger/borrow-positions'), handler: () => json([]) },
      { method: 'GET', test: (url) => url.endsWith('/api/ledger/borrow-positions?status=OPEN'), handler: () => json([]) },
      emptyAllocationLotsRoute(),
      { method: 'POST', test: (url) => url.endsWith('/api/ledger/borrow-positions'), handler: () => json(position, 201) },
    ]);

    const user = userEvent.setup();
    render(<CapitalProvenanceLedgerPage />);
    await screen.findByText('Chưa có khoản vay nào được ghi nhận.');

    await user.type(screen.getByLabelText('Tài sản vay'), 'ZEC');
    await user.type(screen.getByLabelText('Số lượng vay'), '25.1');
    await user.type(screen.getByLabelText('Giá tại thời điểm vay đầu tiên (USDT)'), '420');
    await user.click(screen.getByRole('button', { name: 'Ghi nhận khoản vay' }));

    expect(await screen.findByText(/Liability: 25.1 ZEC/)).toBeInTheDocument();
  });

  it('BR-002: shows the conflict message inline instead of a generic error when a 2nd OPEN position for the same asset is rejected', async () => {
    mockApi([
      csrfRoute,
      availableCapitalRoute(),
      exposureSummaryRoute(),
      { method: 'GET', test: (url) => url.endsWith('/api/ledger/borrow-positions'), handler: () => json([position]) },
      { method: 'GET', test: (url) => url.endsWith('/api/ledger/borrow-positions?status=OPEN'), handler: () => json([position]) },
      { method: 'GET', test: (url) => url.includes('/api/ledger/allocation-lots?fundingBorrowPositionId='), handler: () => json([]) },
      emptyAllocationLotsRoute(),
      {
        method: 'POST',
        test: (url) => url.endsWith('/api/ledger/borrow-positions'),
        handler: () =>
          json(
            { message: 'Bạn đang có khoản vay ZEC chưa trả hết. Phải ghi nhận trả hết khoản vay cũ trước khi mở khoản vay mới cùng tài sản này.' },
            409,
          ),
      },
    ]);

    const user = userEvent.setup();
    render(<CapitalProvenanceLedgerPage />);
    await screen.findByText(/Liability: 25.1 ZEC/);

    await user.type(screen.getByLabelText('Tài sản vay'), 'ZEC');
    await user.type(screen.getByLabelText('Số lượng vay'), '1');
    await user.type(screen.getByLabelText('Giá tại thời điểm vay đầu tiên (USDT)'), '1');
    await user.click(screen.getByRole('button', { name: 'Ghi nhận khoản vay' }));

    expect(await screen.findByText(/Bạn đang có khoản vay ZEC chưa trả hết/)).toBeInTheDocument();
  });

  it('repaying the full liability shows the REPAID release message (BR-006, AC-006)', async () => {
    const repaid = { ...position, status: 'REPAID', liabilityLedger: '0', reservedAmountUsdt: '0', repaidAt: '2026-01-02T00:00:00Z' };
    mockApi([
      csrfRoute,
      availableCapitalRoute(),
      exposureSummaryRoute(),
      { method: 'GET', test: (url) => url.endsWith('/api/ledger/borrow-positions'), handler: () => json([position]) },
      { method: 'GET', test: (url) => url.endsWith('/api/ledger/borrow-positions?status=OPEN'), handler: () => json([position]) },
      { method: 'GET', test: (url) => url.includes('/api/ledger/allocation-lots?fundingBorrowPositionId='), handler: () => json([]) },
      emptyAllocationLotsRoute(),
      { method: 'POST', test: (url) => url.endsWith('/repay'), handler: () => json(repaid, 201) },
    ]);

    const user = userEvent.setup();
    render(<CapitalProvenanceLedgerPage />);
    await screen.findByText(/Liability: 25.1 ZEC/);

    await user.click(screen.getByRole('button', { name: 'Ghi nhận trả nợ' }));
    await user.type(screen.getByLabelText('Số lượng trả nợ (ZEC)'), '25.1');
    const repayButtons = screen.getAllByRole('button', { name: 'Ghi nhận trả nợ' });
    await user.click(repayButtons[repayButtons.length - 1]);

    await waitFor(() =>
      expect(screen.getByText(/Đã trả hết khoản vay\. Toàn bộ số tiền đang giữ/)).toBeInTheDocument(),
    );
  });

  it('R1 (docs/RISK_RULES.md): shows OVER_BORROW_CAP banner when total exposure exceeds collateral/3 (AC-005)', async () => {
    mockApi([
      csrfRoute,
      availableCapitalRoute(),
      exposureSummaryRoute({
        positions: [{ id: 'pos-1', borrowedAsset: 'ZEC', quantity: '25.1', firstBorrowEntryPrice: '420', initialExposureUsdt: '10542' }],
        totalInitialExposureUsdt: '10542',
        collateral: {
          status: 'OK',
          value: '20000',
          fetchedAt: '2026-01-01T00:00:00Z',
          sourceConnectionId: 'conn-1',
          errorMessage: null,
          disclaimer: 'Collateral value (USDT) — theo Binance totalCollateralValueInUSDT, ước lượng chưa verify bằng API thật.',
        },
        cap: '6666.6666666666666667',
        overCap: true,
        capUnavailableReason: null,
      }),
      { method: 'GET', test: (url) => url.endsWith('/api/ledger/borrow-positions'), handler: () => json([position]) },
      { method: 'GET', test: (url) => url.endsWith('/api/ledger/borrow-positions?status=OPEN'), handler: () => json([position]) },
      { method: 'GET', test: (url) => url.includes('/api/ledger/allocation-lots?fundingBorrowPositionId='), handler: () => json([]) },
      emptyAllocationLotsRoute(),
    ]);

    render(<CapitalProvenanceLedgerPage />);

    expect(await screen.findByText(/Tổng vay vượt cap khuyến nghị/)).toBeInTheDocument();
  });

  it('R2 (docs/RISK_RULES.md): checking a position at the 2x boundary shows CRITICAL_REPAY_REQUIRED with buyback estimate (AC-002/AC-003)', async () => {
    mockApi([
      csrfRoute,
      availableCapitalRoute(),
      exposureSummaryRoute(),
      { method: 'GET', test: (url) => url.endsWith('/api/ledger/borrow-positions'), handler: () => json([position]) },
      { method: 'GET', test: (url) => url.endsWith('/api/ledger/borrow-positions?status=OPEN'), handler: () => json([position]) },
      { method: 'GET', test: (url) => url.includes('/api/ledger/allocation-lots?fundingBorrowPositionId='), handler: () => json([]) },
      emptyAllocationLotsRoute(),
      {
        method: 'POST',
        test: (url) => url.endsWith('/api/risk-engine/positions/pos-1/check'),
        handler: () =>
          json({
            positionId: 'pos-1',
            positionStatus: 'OPEN',
            status: 'CRITICAL_REPAY_REQUIRED',
            firstBorrowEntryPrice: '420',
            currentPrice: '840',
            liabilityLedger: '25.1',
            borrowedAsset: 'ZEC',
            buybackCostEstimateUsdt: '21084',
            checkedAt: '2026-01-03T00:00:00Z',
          }),
      },
    ]);

    const user = userEvent.setup();
    render(<CapitalProvenanceLedgerPage />);
    await screen.findByText(/Liability: 25.1 ZEC/);

    expect(screen.getByText('Chưa kiểm tra')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Giá hiện tại của ZEC (USDT)'), '840');
    await user.click(screen.getByRole('button', { name: 'Kiểm tra' }));

    expect(await screen.findByText(/CẦN CHUẨN BỊ TRẢ NỢ/)).toBeInTheDocument();
    expect(screen.getByText(/21084 USDT/)).toBeInTheDocument();
  });
});
