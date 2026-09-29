import {
  ApiError,
  type ApiErrorBody,
  type CsrfTokenResponse,
  type MeResponse,
  type TelegramStartResponse,
  type TelegramStatusResponse,
} from './types';

// Header name assumed for csrf-sync (Synchronizer Token Pattern) integration.
// ASSUMPTION: confirm exact header name with backend-agent implementation.
const CSRF_HEADER_NAME = 'x-csrf-token';

const API_BASE = '/api/auth';

// Cached in-memory only; re-fetched per page load. Not persisted (BR-013 spirit:
// no client-held long-lived secrets beyond what the session cookie already holds).
let cachedCsrfToken: string | null = null;

async function parseErrorBody(response: Response): Promise<ApiErrorBody | null> {
  try {
    return (await response.json()) as ApiErrorBody;
  } catch {
    return null;
  }
}

// Fetches (and caches) the CSRF token for the current session.
// Must be called before the first state-changing submit per page session,
// per architecture/user-authentication.md "UI handoff".
export async function getCsrfToken(forceRefresh = false): Promise<string> {
  if (cachedCsrfToken && !forceRefresh) {
    return cachedCsrfToken;
  }
  const response = await fetch(`${API_BASE}/csrf-token`, {
    method: 'GET',
    credentials: 'include',
  });
  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorBody(response));
  }
  const data = (await response.json()) as CsrfTokenResponse;
  cachedCsrfToken = data.csrfToken;
  return cachedCsrfToken;
}

// Generic request helper: always sends cookies, attaches CSRF header for
// mutating methods, and normalizes errors into ApiError.
async function request<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  requiresCsrf = false,
): Promise<T> {
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

  // No-content responses (e.g. logout) still parse safely.
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export function register(email: string, password: string): Promise<void> {
  return request('POST', '/register', { email, password }, true);
}

export function login(email: string, password: string): Promise<void> {
  return request('POST', '/login', { email, password }, true);
}

export function logout(): Promise<void> {
  return request('POST', '/logout', undefined, true);
}

export function me(): Promise<MeResponse> {
  return request('GET', '/me');
}

export function telegramStart(): Promise<TelegramStartResponse> {
  return request('POST', '/telegram/start', undefined, true);
}

export function telegramStatus(code: string): Promise<TelegramStatusResponse> {
  return request('GET', `/telegram/status/${encodeURIComponent(code)}`);
}

export function linkLocal(email: string, password: string): Promise<void> {
  return request('POST', '/link/local', { email, password }, true);
}

export { ApiError };
