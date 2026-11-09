import { useEffect, useState } from 'react';
import { Library } from '../../src/features/knowledge/components/library';
import type { LibraryView } from '../../src/features/knowledge/types';

export function App() {
  const [username, setUsername] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    fetch('/api/session', { cache: 'no-store' })
      .then(async (response) => {
        if (response.ok) setUsername(((await response.json()) as { username: string }).username);
        else if (response.status !== 401)
          setError('Could not check your session. Please sign in again.');
      })
      .catch(() => setError('Could not connect. Please try again.'))
      .finally(() => setChecking(false));
  }, []);
  async function signout() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/signout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!response.ok) throw new Error('Could not sign out. Please try again.');
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign out.');
      setBusy(false);
    }
  }
  if (checking)
    return (
      <main className="signin-shell" aria-busy="true">
        Opening Lattice…
      </main>
    );
  if (!username)
    return (
      <main className="signin-shell">
        <form
          className="signin-card"
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            setBusy(true);
            setError('');
            try {
              const response = await fetch('/api/signin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  email: data.get('email'),
                  password: data.get('password'),
                }),
              });
              const body = (await response.json()) as { username: string; error?: string };
              if (!response.ok) throw new Error(body.error ?? 'Could not sign in.');
              setUsername(body.username);
            } catch (cause) {
              setError(
                cause instanceof Error ? cause.message : 'Could not connect. Please try again.',
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/lattice.png" alt="" width="72" height="72" />
          <h1>Welcome to Lattice.</h1>
          <p>Sign in to your personal knowledge library.</p>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            disabled={busy}
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            aria-describedby="access-note"
            required
            minLength={8}
            maxLength={128}
            autoComplete="current-password"
            disabled={busy}
          />
          <small id="access-note">
            The email and password you enter are your access to Lattice. On your first sign-in, they
            are saved automatically. Use the same details each time. Choose a password with at least
            8 characters.
          </small>
          {error && (
            <p role="alert" className="signin-error">
              {error}
            </p>
          )}
          <button className="button primary" disabled={busy}>
            {busy ? 'Please wait…' : 'Sign in'}
          </button>
        </form>
      </main>
    );
  const path = window.location.pathname.replace(/\/$/, '');
  const views: Record<string, LibraryView> = {
    '/home': 'home',
    '/sources': 'sources',
    '/settings': 'settings',
  };
  const params = new URLSearchParams(window.location.search);
  return (
    <>
      <Library
        view={views[path] ?? 'all'}
        initialSource={params.get('source') ?? ''}
        initialQuery={params.get('q') ?? ''}
      />
      <div className="account-control">
        <span>{username}</span>
        <button className="button" onClick={() => void signout()} disabled={busy}>
          Sign out
        </button>
        {error && <span role="alert">{error}</span>}
      </div>
    </>
  );
}
