import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from './LoginForm';

describe('LoginForm', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/auth/csrf-token')) {
          return new Response(JSON.stringify({ csrfToken: 'csrf-abc' }), { status: 200 });
        }
        if (url.endsWith('/api/auth/login')) {
          // Backend would return a specific reason internally, but the
          // contract (BR-010/AC-004) says the message body is already
          // generic. We still assert the UI never surfaces this raw text
          // and instead shows its own fixed neutral copy.
          return new Response(JSON.stringify({ message: 'account is locked' }), { status: 401 });
        }
        throw new Error(`Unexpected fetch call: ${url}`);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows a neutral error message when login fails, regardless of backend reason', async () => {
    render(<LoginForm onLoggedIn={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Email hoặc password không đúng.');
    expect(alert).not.toHaveTextContent('locked');

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/login'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });
});
