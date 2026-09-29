import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountLinkPanel } from './AccountLinkPanel';

function mockMeResponse(body: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) {
        return new Response(JSON.stringify(body), { status: 200 });
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    }),
  );
}

describe('AccountLinkPanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows only "Liên kết Telegram" when local credential exists but Telegram does not', async () => {
    mockMeResponse({
      userId: 'user-1',
      hasLocalCredential: true,
      hasTelegramIdentity: false,
      localEmailMasked: 'u***@example.com',
    });

    render(<AccountLinkPanel />);

    expect(await screen.findByText('Email/Password: Đã liên kết')).toBeInTheDocument();
    expect(screen.getByText('Telegram: Chưa liên kết')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Liên kết Telegram' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thêm email + password' })).not.toBeInTheDocument();
  });

  it('shows only "Thêm email + password" when Telegram exists but local credential does not', async () => {
    mockMeResponse({
      userId: 'user-2',
      hasLocalCredential: false,
      hasTelegramIdentity: true,
    });

    render(<AccountLinkPanel />);

    expect(await screen.findByText('Email/Password: Chưa liên kết')).toBeInTheDocument();
    expect(screen.getByText('Telegram: Đã liên kết')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thêm email + password' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Liên kết Telegram' })).not.toBeInTheDocument();
  });

  it('shows both link actions when neither method is linked', async () => {
    mockMeResponse({
      userId: 'user-3',
      hasLocalCredential: false,
      hasTelegramIdentity: false,
    });

    render(<AccountLinkPanel />);

    expect(await screen.findByRole('button', { name: 'Liên kết Telegram' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thêm email + password' })).toBeInTheDocument();
  });
});
