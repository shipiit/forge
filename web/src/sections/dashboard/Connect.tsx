import { useEffect, useState } from 'react';
import { apiBase, apiToken, saveConnection, signIn, signOut, signedInAs, hasAccounts, DEV_PROXY } from '../../lib/usage';

/**
 * Getting in.
 *
 * Two ways, because they are for two different things. A person signs in with
 * a name and a password and gets a session that expires and can be revoked on
 * its own. A script uses the shared token, which never expires — which is
 * exactly why it is not a person.
 *
 * Which one is offered is decided by the server: a deployment with no accounts
 * only shows the token field, because a sign-in form nobody can use is worse
 * than no form at all.
 */

const FIELD =
  'w-full rounded-[9px] border border-line/[0.08] bg-panelStrong px-3 py-2 font-mono text-[12.5px] text-text placeholder:text-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50';

const LABEL = 'mt-4 block text-[12px] font-medium uppercase tracking-[0.07em] text-faint';

function Tab({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-selected={on}
      role="tab"
      className={`rounded-[9px] px-3 py-1.5 text-[12.5px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
        on ? 'bg-accent/15 font-semibold text-accent' : 'text-muted hover:text-text'
      }`}
    >
      {children}
    </button>
  );
}

export function Connect({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [base, setBase] = useState(apiBase() || DEV_PROXY);
  const [token, setToken] = useState(apiToken());
  const [username, setUsername] = useState(signedInAs());
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'account' | 'token'>('account');
  const [accounts, setAccounts] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Ask the server which of the two is worth offering. Re-asked when the base
  // changes, because pointing at a different agent is pointing at a different
  // set of accounts.
  useEffect(() => {
    if (!open) return;
    let live = true;
    setAccounts(null);
    void hasAccounts(base.replace(/\/+$/, '')).then((has) => {
      if (!live) return;
      setAccounts(has);
      setMode(has ? 'account' : 'token');
    });
    return () => {
      live = false;
    };
  }, [open, base]);

  if (!open) return null;

  const who = signedInAs();

  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      if (mode === 'account') {
        await signIn(base, username, password);
      } else {
        saveConnection(base, token);
      }
      setPassword('');
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-5" onClick={onClose}>
      <div
        className="w-full max-w-[520px] rounded-2xl border border-line/[0.08] bg-panel p-6 shadow-glow"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Connect to your agent"
      >
        <h2 className="text-[16px] font-semibold">Connect to your agent</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          The dashboard reads from the API the agent serves. Start it with{' '}
          <code className="rounded bg-line/[0.07] px-1.5 py-0.5 font-mono text-[12px]">forge dashboard</code>, or point
          this at a hosted App with the dashboard mounted at{' '}
          <code className="rounded bg-line/[0.07] px-1.5 py-0.5 font-mono text-[12px]">/usage</code>.
        </p>

        {who && (
          <div className="mt-4 flex items-center justify-between rounded-[9px] border border-line/[0.08] bg-panelStrong px-3 py-2">
            <span className="text-[12.5px] text-muted">
              Signed in as <b className="text-text">{who}</b>
            </span>
            <button
              type="button"
              onClick={async () => {
                await signOut();
                setUsername('');
                onSaved();
              }}
              className="text-[12.5px] text-muted underline decoration-line/40 underline-offset-2 transition-colors hover:text-text"
            >
              Sign out
            </button>
          </div>
        )}

        <label className={LABEL} htmlFor="api-base">
          API base URL
        </label>
        <input
          id="api-base"
          className={`${FIELD} mt-1.5`}
          value={base}
          onChange={(e) => setBase(e.target.value)}
          placeholder="http://localhost:4300"
        />

        {accounts && (
          <div className="mt-5 flex gap-1.5" role="tablist" aria-label="How to sign in">
            <Tab on={mode === 'account'} onClick={() => setMode('account')}>
              Sign in
            </Tab>
            <Tab on={mode === 'token'} onClick={() => setMode('token')}>
              Access token
            </Tab>
          </div>
        )}

        {mode === 'account' && accounts ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <label className={LABEL} htmlFor="account-user">
              Username
            </label>
            <input
              id="account-user"
              className={`${FIELD} mt-1.5`}
              value={username}
              autoComplete="username"
              disabled={busy}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="your-name"
            />

            <label className={LABEL} htmlFor="account-pass">
              Password
            </label>
            <input
              id="account-pass"
              className={`${FIELD} mt-1.5`}
              type="password"
              value={password}
              autoComplete="current-password"
              disabled={busy}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
            />
            <p className="mt-2 text-[12px] leading-relaxed text-faint">
              The password is sent once and never stored — what is kept is a session that expires on its own and can
              be revoked without touching anybody else's.
            </p>
            <button type="submit" className="hidden" />
          </form>
        ) : (
          <>
            <label className={LABEL} htmlFor="api-token">
              Access token{' '}
              <span className="normal-case tracking-normal">
                {accounts === false ? '(this deployment has no accounts yet)' : '(for scripts and CI)'}
              </span>
            </label>
            <input
              id="api-token"
              className={`${FIELD} mt-1.5`}
              type="password"
              value={token}
              disabled={busy}
              onChange={(e) => setToken(e.target.value)}
              placeholder="FORGE_DASHBOARD_TOKEN"
            />
            {accounts === false && (
              <p className="mt-2 text-[12px] leading-relaxed text-faint">
                Prefer named accounts? Run{' '}
                <code className="rounded bg-line/[0.07] px-1.5 py-0.5 font-mono text-[11.5px]">
                  forge dashboard:user add &lt;name&gt;
                </code>{' '}
                on the machine holding the database, and this dialog will offer a sign-in form.
              </p>
            )}
          </>
        )}

        {error && (
          <p className="mt-3 rounded-[9px] border border-bad/25 bg-bad/10 px-3 py-2 text-[12.5px] text-bad" role="alert">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2.5">
          <button
            onClick={onClose}
            className="rounded-[9px] border border-line/[0.12] px-4 py-2 text-[13px] text-muted transition-colors hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={busy}
            className="rounded-[9px] bg-accent px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            {busy ? 'Signing in…' : mode === 'account' && accounts ? 'Sign in' : 'Save & reload'}
          </button>
        </div>
      </div>
    </div>
  );
}
