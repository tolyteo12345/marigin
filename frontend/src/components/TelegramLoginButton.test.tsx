import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TelegramLoginButton } from './TelegramLoginButton';

const START_RESPONSE = {
  code: 'code-123',
  deepLinkUrl: 'https://t.me/testbot?start=code-123',
  expiresAt: new Date(Date.now() + 300_000).toISOString(),
};

function mockFetchSequence(statusResponses: Array<Record<string, unknown>>) {
  let statusCallIndex = 0;
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/api/auth/csrf-token')) {
      return new Response(JSON.stringify({ csrfToken: 'csrf-abc' }), { status: 200 });
    }
    if (url.endsWith('/api/auth/telegram/start')) {
      return new Response(JSON.stringify(START_RESPONSE), { status: 200 });
    }
    if (url.includes('/api/auth/telegram/status/')) {
      const body = statusResponses[Math.min(statusCallIndex, statusResponses.length - 1)];
      statusCallIndex += 1;
      return new Response(JSON.stringify(body), { status: 200 });
    }
    throw new Error(`Unexpected fetch call: ${url}`);
  });
}

describe('TelegramLoginButton', () => {
  beforeEach(() => {
    vi.stubGlobal('open', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('goes PENDING -> CLAIMED and calls onClaimed', async () => {
    vi.stubGlobal('fetch', mockFetchSequence([{ status: 'PENDING' }, { status: 'CLAIMED' }]));
    const onClaimed = vi.fn();
    render(
      <TelegramLoginButton
        label="Đăng nhập với Telegram"
        onClaimed={onClaimed}
        pollIntervalMs={10}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập với Telegram' }));

    await screen.findByText('Đang chờ xác nhận trên Telegram...');
    expect(window.open).toHaveBeenCalledWith(
      START_RESPONSE.deepLinkUrl,
      '_blank',
      'noopener,noreferrer',
    );

    await waitFor(() => expect(onClaimed).toHaveBeenCalledTimes(1));
    await screen.findByText('Đã xác nhận, đang chuyển hướng...');
  });

  it('shows the rejection reason on REJECTED', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchSequence([
        { status: 'PENDING' },
        { status: 'REJECTED', reason: 'tài khoản Telegram này đã được liên kết với người khác' },
      ]),
    );
    render(
      <TelegramLoginButton label="Đăng nhập với Telegram" onClaimed={vi.fn()} pollIntervalMs={10} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập với Telegram' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('tài khoản Telegram này đã được liên kết với người khác');
    expect(screen.getByRole('button', { name: 'Tạo mã mới' })).toBeInTheDocument();
  });

  it('shows "Tạo mã mới" on EXPIRED', async () => {
    vi.stubGlobal('fetch', mockFetchSequence([{ status: 'PENDING' }, { status: 'EXPIRED' }]));
    render(
      <TelegramLoginButton label="Đăng nhập với Telegram" onClaimed={vi.fn()} pollIntervalMs={10} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập với Telegram' }));

    await screen.findByText('Mã đã hết hạn.');
    expect(screen.getByRole('button', { name: 'Tạo mã mới' })).toBeInTheDocument();
  });

  it('stays PENDING while waiting', async () => {
    vi.stubGlobal('fetch', mockFetchSequence([{ status: 'PENDING' }]));
    render(
      <TelegramLoginButton label="Đăng nhập với Telegram" onClaimed={vi.fn()} pollIntervalMs={10} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập với Telegram' }));

    await screen.findByText('Đang chờ xác nhận trên Telegram...');
    // Give a couple of poll cycles a chance to run; status should remain PENDING.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByText('Đang chờ xác nhận trên Telegram...')).toBeInTheDocument();
  });
});
