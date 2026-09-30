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

// The backend regenerates the session (new csrfToken) on every anonymous ->
// authenticated transition (login, register, Telegram claim), per the
// session-fixation rule in architecture/user-authentication.md. The SPA never
// reloads across that transition (App.tsx just flips isLoggedIn), so a token
// cached before the transition would otherwise be replayed against the new
// session and rejected with 403. Call this right after any such transition
// resolves so the next CSRF-protected request fetches a fresh token.
function invalidateCsrfToken(): void {
  cachedCsrfToken = null;
}

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

export async function register(email: string, password: string): Promise<void> {
  await request('POST', '/register', { email, password }, true);
  invalidateCsrfToken();
}

export async function login(email: string, password: string): Promise<void> {
  await request('POST', '/login', { email, password }, true);
  invalidateCsrfToken();
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

export async function telegramStatus(code: string): Promise<TelegramStatusResponse> {
  const result = await request<TelegramStatusResponse>('GET', `/telegram/status/${encodeURIComponent(code)}`);
  if (result.status === 'CLAIMED') {
    invalidateCsrfToken();
  }
  return result;
}

export function linkLocal(email: string, password: string): Promise<void> {
  return request('POST', '/link/local', { email, password }, true);
}

export { ApiError };
