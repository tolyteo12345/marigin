import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BinanceConnectionsPage } from './BinanceConnectionsPage';

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

const verifiedConnection = {
  id: 'conn-1',
  label: 'Main',
  status: 'VERIFIED',
  accountType: 'MARGIN_1',
  permissionSnapshot: {
    ipRestrict: false,
    enableReading: true,
    enableMargin: true,
    enableSpotAndMarginTrading: false,
    enableWithdrawals: false,
    enableInternalTransfer: false,
    enableFutures: false,
    enableVanillaOptions: false,
    enablePortfolioMarginTrading: false,
    checkedAt: '2026-01-01T00:00:00Z',
  },
  permissionUnknown: false,
  lastError: null,
  lastVerifiedAt: '2026-01-01T00:00:00Z',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('BinanceConnectionsPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the empty state when the user has no connections', async () => {
    mockApi([csrfRoute, { method: 'GET', test: (url) => url.endsWith('/api/binance-connections'), handler: () => json([]) }]);

    render(<BinanceConnectionsPage />);

    expect(await screen.findByText('Bạn chưa có kết nối Binance nào.')).toBeInTheDocument();
  });

  it('lists an existing VERIFIED connection with its account snapshot trigger', async () => {
    mockApi([csrfRoute, { method: 'GET', test: (url) => url.endsWith('/api/binance-connections'), handler: () => json([verifiedConnection]) }]);

    render(<BinanceConnectionsPage />);

    expect(await screen.findByText('Main')).toBeInTheDocument();
    expect(screen.getByText('Đã xác minh — Cross Margin Classic.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xem số dư margin' })).toBeInTheDocument();
  });

  it('adding a connection that verifies as INVALID shows the invalid status and a retry action, not a form error', async () => {
    const invalidConnection = { ...verifiedConnection, id: 'conn-2', status: 'INVALID', accountType: null, lastError: 'Kết nối không hợp lệ: API key hoặc secret sai hoặc đã hết hạn.' };
    mockApi([
      csrfRoute,
      { method: 'GET', test: (url) => url.endsWith('/api/binance-connections'), handler: () => json([]) },
      { method: 'POST', test: (url) => url.endsWith('/api/binance-connections'), handler: () => json(invalidConnection, 201) },
    ]);

    const user = userEvent.setup();
    render(<BinanceConnectionsPage />);
    await screen.findByText('Bạn chưa có kết nối Binance nào.');

    await user.type(screen.getByLabelText('Tên gợi nhớ'), 'Sai key');
    await user.type(screen.getByLabelText('API Key'), 'bad-key');
    await user.type(screen.getByLabelText('API Secret'), 'bad-secret');
    await user.click(screen.getByRole('button', { name: 'Thêm kết nối' }));

    expect(await screen.findByText('Kết nối không hợp lệ: API key hoặc secret sai hoặc đã hết hạn.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xác minh lại' })).toBeInTheDocument();
  });

  it('shows the permission-too-broad banner and lets the user acknowledge it once', async () => {
    const tooBroad = { ...verifiedConnection, permissionSnapshot: { ...verifiedConnection.permissionSnapshot, enableWithdrawals: true } };
    mockApi([csrfRoute, { method: 'GET', test: (url) => url.endsWith('/api/binance-connections'), handler: () => json([tooBroad]) }]);

    const user = userEvent.setup();
    render(<BinanceConnectionsPage />);

    expect(await screen.findByText(/quyền vượt quá mức cần thiết/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Đã hiểu, tiếp tục' }));
    expect(screen.queryByText(/quyền vượt quá mức cần thiết/)).not.toBeInTheDocument();
  });

  it('revoking a connection removes its card from the page', async () => {
    mockApi([
      csrfRoute,
      { method: 'GET', test: (url) => url.endsWith('/api/binance-connections'), handler: () => json([verifiedConnection]) },
      { method: 'DELETE', test: (url) => url.includes('/api/binance-connections/conn-1'), handler: () => json({ ok: true }) },
    ]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const user = userEvent.setup();
    render(<BinanceConnectionsPage />);
    await screen.findByText('Main');

    await user.click(screen.getByRole('button', { name: 'Xoá kết nối' }));

    await waitFor(() => expect(screen.queryByText('Main')).not.toBeInTheDocument());
  });

  it('does not revoke when the user cancels the confirm dialog', async () => {
    mockApi([csrfRoute, { method: 'GET', test: (url) => url.endsWith('/api/binance-connections'), handler: () => json([verifiedConnection]) }]);
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    const user = userEvent.setup();
    render(<BinanceConnectionsPage />);
    await screen.findByText('Main');

    await user.click(screen.getByRole('button', { name: 'Xoá kết nối' }));

    expect(screen.getByText('Main')).toBeInTheDocument();
  });
});
