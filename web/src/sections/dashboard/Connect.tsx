import { useState } from 'react';
import { apiBase, apiToken, saveConnection, DEV_PROXY } from '../../lib/usage';

/**
 * Where the API lives.
 *
 * This site is static and can be served from anywhere; the usage API runs
 * wherever the agent does. Rather than guess, ask once and remember. In dev the
 * Vite proxy already points at `forge dashboard`, so the field starts filled in.
 */
export function Connect({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [base, setBase] = useState(apiBase() || DEV_PROXY);
  const [token, setToken] = useState(apiToken());
  if (!open) return null;

  const field =
    'w-full rounded-[9px] border border-line/[0.08] bg-panelStrong px-3 py-2 font-mono text-[12.5px] text-text placeholder:text-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-5" onClick={onClose}>
      <div className="w-full max-w-[520px] rounded-2xl border border-line/[0.08] bg-panel p-6 shadow-glow" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[16px] font-semibold">Connect to your agent</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          The dashboard reads from the API the agent serves. Start it with{' '}
          <code className="rounded bg-line/[0.07] px-1.5 py-0.5 font-mono text-[12px]">forge dashboard</code>, or point this at a
          hosted App with the dashboard mounted at <code className="rounded bg-line/[0.07] px-1.5 py-0.5 font-mono text-[12px]">/usage</code>.
        </p>

        <label className="mt-5 block text-[12px] font-medium uppercase tracking-[0.07em] text-faint" htmlFor="api-base">
          API base URL
        </label>
        <input id="api-base" className={`${field} mt-1.5`} value={base} onChange={(e) => setBase(e.target.value)} placeholder="http://localhost:4300" />

        <label className="mt-4 block text-[12px] font-medium uppercase tracking-[0.07em] text-faint" htmlFor="api-token">
          Access token <span className="normal-case tracking-normal">(required unless it is bound to localhost)</span>
        </label>
        <input id="api-token" className={`${field} mt-1.5`} type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="FORGE_DASHBOARD_TOKEN" />

        <div className="mt-6 flex justify-end gap-2.5">
          <button onClick={onClose} className="rounded-[9px] border border-line/[0.12] px-4 py-2 text-[13px] text-muted transition-colors hover:text-text">
            Cancel
          </button>
          <button
            onClick={() => {
              saveConnection(base, token);
              onSaved();
              onClose();
            }}
            className="rounded-[9px] bg-accent px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            Save & reload
          </button>
        </div>
      </div>
    </div>
  );
}
