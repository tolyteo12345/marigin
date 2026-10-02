import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RepayForm } from './RepayForm';
import type { BorrowPositionView } from '../../api/ledgerTypes';

const position: BorrowPositionView = {
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('RepayForm', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Regression (code-review finding, 2026-10-02): RepayForm deliberately
  // stays mounted after a successful submit so its inline confirmation
  // message stays visible (design mục 8b) — unlike every other ledger form.
  // That means a 2nd submit in the same open form must NOT reuse the 1st
  // submit's Idempotency-Key, or the backend's idempotency replay
  // (ledger.service.ts repay()) silently no-ops the 2nd repayment.
  it('uses a different Idempotency-Key for a 2nd repay submitted in the same still-open form', async () => {
    const idempotencyKeys: (string | null)[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/api/auth/csrf-token')) {
          return json({ csrfToken: 'test-csrf-token' });
        }
        if (url.endsWith('/repay')) {
          idempotencyKeys.push((init?.headers as Record<string, string> | undefined)?.['Idempotency-Key'] ?? null);
          const liabilityLedger = idempotencyKeys.length === 1 ? '20.1' : '0';
          const status = idempotencyKeys.length === 1 ? 'OPEN' : 'REPAID';
          return json({ ...position, liabilityLedger, status });
        }
        throw new Error(`Unexpected fetch call: ${url}`);
      }),
    );

    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<RepayForm position={position} onDone={onDone} onCancel={() => {}} />);

    await user.type(screen.getByLabelText('Số lượng trả nợ (ZEC)'), '5');
    await user.click(screen.getByRole('button', { name: 'Ghi nhận trả nợ' }));
    await screen.findByLabelText('Số lượng trả nợ (ZEC)'); // still mounted after success

    await user.type(screen.getByLabelText('Số lượng trả nợ (ZEC)'), '20.1');
    await user.click(screen.getByRole('button', { name: 'Ghi nhận trả nợ' }));

    expect(idempotencyKeys).toHaveLength(2);
    expect(idempotencyKeys[0]).toBeTruthy();
    expect(idempotencyKeys[1]).toBeTruthy();
    expect(idempotencyKeys[0]).not.toBe(idempotencyKeys[1]);
    expect(onDone).toHaveBeenCalledTimes(2);
  });
});
