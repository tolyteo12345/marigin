import { ApiError, getCsrfToken } from './authClient';
import type {
  AllocationAsset,
  AllocationFundingSource,
  AllocationLotView,
  AvailableCapitalView,
  BorrowPositionView,
  BorrowPositionStatus,
  LedgerEventView,
  ReconcileResult,
} from './ledgerTypes';

const CSRF_HEADER_NAME = 'x-csrf-token';
const API_BASE = '/api/ledger';

async function parseErrorBody(response: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function request<T>(
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  body?: unknown,
  opts: { requiresCsrf?: boolean; idempotencyKey?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  let requestBody: string | undefined;

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    requestBody = JSON.stringify(body);
  }
  if (opts.requiresCsrf) {
    headers[CSRF_HEADER_NAME] = await getCsrfToken();
  }
  if (opts.idempotencyKey) {
    headers['Idempotency-Key'] = opts.idempotencyKey;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: 'include',
    headers,
    body: requestBody,
  });

  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorBody(response));
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// One fresh UUID per distinct user-entered form submission — the caller
// supplies it (design/capital-provenance-ledger.md "Idempotency"), generated
// once when a form opens/resets and reused across retries of the same submit.
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function listBorrowPositions(status?: BorrowPositionStatus): Promise<BorrowPositionView[]> {
  return request('GET', status ? `/borrow-positions?status=${status}` : '/borrow-positions');
}

export function getBorrowPosition(id: string): Promise<BorrowPositionView> {
  return request('GET', `/borrow-positions/${encodeURIComponent(id)}`);
}

export function createBorrowPosition(
  dto: { borrowedAsset: string; quantity: string; firstBorrowEntryPrice: string },
  idempotencyKey: string,
): Promise<BorrowPositionView> {
  return request('POST', '/borrow-positions', dto, { requiresCsrf: true, idempotencyKey });
}

export function sellAsset(
  positionId: string,
  dto: { quantitySold: string; proceedsUsdt: string },
  idempotencyKey: string,
): Promise<BorrowPositionView> {
  return request('POST', `/borrow-positions/${encodeURIComponent(positionId)}/sell-asset`, dto, {
    requiresCsrf: true,
    idempotencyKey,
  });
}

export function repay(positionId: string, dto: { amount: string }, idempotencyKey: string): Promise<BorrowPositionView> {
  return request('POST', `/borrow-positions/${encodeURIComponent(positionId)}/repay`, dto, {
    requiresCsrf: true,
    idempotencyKey,
  });
}

export function reconcile(positionId: string): Promise<ReconcileResult> {
  return request('POST', `/borrow-positions/${encodeURIComponent(positionId)}/reconcile`, undefined, { requiresCsrf: true });
}

export function listAllocationLots(fundingBorrowPositionId?: string): Promise<AllocationLotView[]> {
  return request('GET', fundingBorrowPositionId ? `/allocation-lots?fundingBorrowPositionId=${fundingBorrowPositionId}` : '/allocation-lots');
}

export function createAllocationLot(
  dto: { asset: AllocationAsset; quantity: string; costBasisUsdt: string; fundingSource: AllocationFundingSource; fundingBorrowPositionId?: string },
  idempotencyKey: string,
): Promise<AllocationLotView> {
  return request('POST', '/allocation-lots', dto, { requiresCsrf: true, idempotencyKey });
}

export function sellLot(lotId: string, dto: { quantitySold: string; proceedsUsdt: string }, idempotencyKey: string): Promise<AllocationLotView> {
  return request('POST', `/allocation-lots/${encodeURIComponent(lotId)}/sell`, dto, { requiresCsrf: true, idempotencyKey });
}

export function listEvents(filter: { borrowPositionId?: string; allocationLotId?: string }): Promise<LedgerEventView[]> {
  const params = new URLSearchParams();
  if (filter.borrowPositionId) params.set('borrowPositionId', filter.borrowPositionId);
  if (filter.allocationLotId) params.set('allocationLotId', filter.allocationLotId);
  const qs = params.toString();
  return request('GET', qs ? `/events?${qs}` : '/events');
}

export function createCorrection(
  targetEventId: string,
  dto: {
    reason: string;
    borrowPositionId?: string;
    newLiabilityLedger?: string;
    newReservedAmountUsdt?: string;
    allocationLotId?: string;
    newRemainingQuantity?: string;
  },
  idempotencyKey: string,
): Promise<LedgerEventView> {
  return request('POST', `/events/${encodeURIComponent(targetEventId)}/correct`, dto, { requiresCsrf: true, idempotencyKey });
}

export function getAvailableCapital(): Promise<AvailableCapitalView> {
  return request('GET', '/available-capital');
}

export function updatePersonalCapital(amountUsdt: string): Promise<{ personalCapitalUsdt: string }> {
  return request('PUT', '/personal-capital', { amountUsdt }, { requiresCsrf: true });
}

export { ApiError };
