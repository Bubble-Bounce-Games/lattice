// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../aws/frontend/app';

vi.mock('../src/features/knowledge/components/library', () => ({
  Library: () => (
    <main>
      <h1>Your library</h1>
    </main>
  ),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe('email access', () => {
  it('uses one email sign-in form, explains access, and opens the library after sign-in', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'Sign in' }, 401))
      .mockResolvedValueOnce(jsonResponse({ username: 'reader@example.com' }));
    vi.stubGlobal('fetch', fetch);
    const user = userEvent.setup();
    render(<App />);
    const email = await screen.findByLabelText('Email');
    expect(screen.queryByRole('button', { name: /create account/i })).toBeNull();
    expect(screen.getByText(/On your first sign-in, they are saved automatically/)).toBeTruthy();
    await user.type(email, 'reader@example.com');
    await user.type(screen.getByLabelText('Password'), 'reader-pass-123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Your library' })).toBeTruthy();
    const [path, options] = fetch.mock.calls[1];
    expect(path).toBe('/api/signin');
    expect(JSON.parse(options.body)).toEqual({
      email: 'reader@example.com',
      password: 'reader-pass-123',
    });
  });
  it('shows a wrong-password error and keeps the entered details available', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ error: 'Sign in' }, 401))
        .mockResolvedValueOnce(jsonResponse({ error: 'Email or password is wrong.' }, 401)),
    );
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText('Email'), 'reader@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Email or password is wrong.');
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('reader@example.com');
    expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('wrong-password');
    expect(screen.queryByRole('heading', { name: 'Your library' })).toBeNull();
  });
});
