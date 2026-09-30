import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { ThemeProvider } from './theme/ThemeProvider';

function mockApi(meStatus: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) {
        return meStatus === 200
          ? new Response(JSON.stringify({ userId: 'u1', hasLocalCredential: true, hasTelegramIdentity: false }), { status: 200 })
          : new Response(JSON.stringify({ message: 'unauthorized' }), { status: 401 });
      }
      if (url.endsWith('/api/binance-connections')) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    }),
  );
}

// Regression test: App used to always start from isLoggedIn=false regardless
// of an existing session cookie, so reloading the page while logged in
// dropped the user back to the login screen even though the server session
// was still valid. It must now ask GET /api/auth/me once on mount and render
// the dashboard directly when that session is still valid.
describe('App (session restore on load)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the logged-in dashboard directly when a valid session already exists (e.g. after a reload)', async () => {
    mockApi(200);

    render(<ThemeProvider><App /></ThemeProvider>);

    expect(await screen.findByText('Liên kết tài khoản')).toBeInTheDocument();
    expect(screen.getByText('Kết nối Binance')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Đăng nhập' })).not.toBeInTheDocument();
  });

  it('renders the login screen when there is no valid session', async () => {
    mockApi(401);

    render(<ThemeProvider><App /></ThemeProvider>);

    expect(await screen.findByRole('button', { name: 'Đăng nhập' })).toBeInTheDocument();
  });
});
