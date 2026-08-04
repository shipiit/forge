import { useState } from 'react';
import { signIn, apiBase, assetUrl } from '../../lib/usage';

/**
 * The front door.
 *
 * When the agent serves this page itself, signing in is the first thing that
 * happens — not something buried in a settings dialog behind a dashboard that
 * cannot load. The connection details are already known: the API is the same
 * origin that served this page, so all that is left to ask for is who you are.
 */
export function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      await signIn(apiBase(), username, password);
      setPassword('');
      onSignedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
      setBusy(false);
    }
  };

  const field =
    'w-full rounded-[10px] border border-line/[0.10] bg-panelStrong px-3.5 py-2.5 text-[14px] text-text ' +
    'placeholder:text-faint transition-colors focus-visible:outline focus-visible:outline-2 ' +
    'focus-visible:outline-accent disabled:opacity-50';

  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-5">
      <div className="w-full max-w-[380px]">
        <div className="mb-7 flex items-center gap-3">
          <img
            src={assetUrl('logo.png')}
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 rounded-[11px]"
          />
          <div>
            <div className="text-[15.5px] font-semibold leading-tight text-text">ShipIT Forge</div>
            <div className="text-[12.5px] leading-tight text-muted">Usage dashboard</div>
          </div>
        </div>

        <form
          onSubmit={submit}
          className="rounded-2xl border border-line/[0.08] bg-panel p-6 shadow-glow"
          aria-label="Sign in"
        >
          <h1 className="text-[16px] font-semibold text-text">Sign in</h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            Every run, turn, tool call and dollar — for this agent.
          </p>

          <label className="mt-5 block text-[12px] font-medium uppercase tracking-[0.07em] text-faint" htmlFor="u">
            Username
          </label>
          <input
            id="u"
            className={`${field} mt-1.5`}
            value={username}
            autoComplete="username"
            autoFocus
            disabled={busy}
            onChange={(e) => setUsername(e.target.value)}
          />

          <label className="mt-4 block text-[12px] font-medium uppercase tracking-[0.07em] text-faint" htmlFor="p">
            Password
          </label>
          <input
            id="p"
            className={`${field} mt-1.5`}
            type="password"
            value={password}
            autoComplete="current-password"
            disabled={busy}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && (
            <p
              className="mt-4 rounded-[10px] border border-bad/25 bg-bad/10 px-3.5 py-2.5 text-[12.5px] text-bad"
              role="alert"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || !username || !password}
            className="mt-6 w-full rounded-[10px] bg-accent py-2.5 text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-5 text-center text-[12px] leading-relaxed text-faint">
          No account yet? On the machine holding the database, run
          <br />
          <code className="mt-1 inline-block rounded bg-line/[0.07] px-2 py-1 font-mono text-[11.5px] text-muted">
            forge dashboard:user add &lt;name&gt;
          </code>
        </p>
      </div>
    </div>
  );
}
