import { ApiError, getCsrfToken } from './authClient';
import type { ExposureSummaryView, PositionRiskCheckView } from './riskEngineTypes';

const CSRF_HEADER_NAME = 'x-csrf-token';
const API_BASE = '/api/risk-engine';

async function parseErrorBody(response: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown, opts: { requiresCsrf?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  let requestBody: string | undefined;

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    requestBody = JSON.stringify(body);
  }
  if (opts.requiresCsrf) {
    headers[CSRF_HEADER_NAME] = await getCsrfToken();
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

export function getExposureSummary(): Promise<ExposureSummaryView> {
  return request('GET', '/exposure-summary');
}

// R2 (BR-003): currentPrice is never persisted — a fresh call every time,
// never cached/merged with a previous result on this side either.
export function checkPositionRisk(positionId: string, currentPrice: string): Promise<PositionRiskCheckView> {
  return request('POST', `/positions/${encodeURIComponent(positionId)}/check`, { currentPrice }, { requiresCsrf: true });
}

export { ApiError };
