import { ApiError, getCsrfToken } from './authClient';
import type { AccountSnapshot, ConnectionView } from './binanceConnectionTypes';

const CSRF_HEADER_NAME = 'x-csrf-token';
const API_BASE = '/api/binance-connections';

async function parseErrorBody(response: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function request<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown, requiresCsrf = false): Promise<T> {
  const headers: Record<string, string> = {};
  let requestBody: string | undefined;

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    requestBody = JSON.stringify(body);
  }

  if (requiresCsrf) {
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

export function listConnections(): Promise<ConnectionView[]> {
  return request('GET', '');
}

export function createConnection(label: string, apiKey: string, apiSecret: string): Promise<ConnectionView> {
  return request('POST', '', { label, apiKey, apiSecret }, true);
}

export function verifyConnection(id: string): Promise<ConnectionView> {
  return request('POST', `/${encodeURIComponent(id)}/verify`, undefined, true);
}

export function getAccountSnapshot(id: string): Promise<AccountSnapshot> {
  return request('GET', `/${encodeURIComponent(id)}/account-snapshot`);
}

export function revokeConnection(id: string): Promise<void> {
  return request('DELETE', `/${encodeURIComponent(id)}`, undefined, true);
}

export { ApiError };
