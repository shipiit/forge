import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Sidebar, Topbar } from './Shell';
import { Connect } from './Connect';
import { SignIn } from './SignIn';
import { useTheme } from './hooks';
import { authState, DEFAULT_FILTERS, filterParams, useUsage, type Facets, type Filters } from '../../lib/usage';

/**
 * The frame every dashboard page sits in.
 *
 * Filters live in the URL rather than in component state: switching from the
 * overview to the run log should not silently reset the window someone chose,
 * and a filtered view should be a link they can send to somebody.
 */
export interface DashboardContext {
  filters: Filters;
  params: Record<string, string | number | undefined>;
  /** Bump to force every query on the page to re-run. */
  tick: number;
  refresh: () => void;
  setLoading: (loading: boolean) => void;
  setNote: (note: string) => void;
}

export function DashboardLayout({ children }: { children: (ctx: DashboardContext) => React.ReactNode }) {
  // Asked once, before anything else loads. A dashboard that renders its
  // frame, fires a dozen queries and then shows twelve "unauthorized" boxes
  // has told somebody they are signed out in the least useful way available.
  const [gate, setGate] = useState<{ accounts: boolean; signedIn: boolean } | null>(null);
  const check = useCallback(() => {
    void authState().then(setGate, () => setGate({ accounts: false, signedIn: false }));
  }, []);
  useEffect(check, [check]);

  const [search, setSearch] = useSearchParams();
  const [connecting, setConnecting] = useState(false);
  const [menu, setMenu] = useState(false);
  const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');
  const { theme, toggle } = useTheme();
  const { pathname } = useLocation();

  const filters: Filters = useMemo(
    () => ({
      days: Number(search.get('days')) || DEFAULT_FILTERS.days,
      repo: search.get('repo') ?? '',
      flow: search.get('flow') ?? '',
      skill: search.get('skill') ?? '',
      status: search.get('status') ?? '',
      q: search.get('q') ?? '',
    }),
    [search],
  );

  const change = useCallback(
    (next: Partial<Filters>) => {
      const merged = { ...filters, ...next };
      const params = new URLSearchParams();
      // Only what differs from the default, so a plain view has a plain URL.
      if (merged.days !== DEFAULT_FILTERS.days) params.set('days', String(merged.days));
      for (const key of ['repo', 'flow', 'skill', 'status', 'q'] as const) {
        if (merged[key]) params.set(key, merged[key]);
      }
      setSearch(params, { replace: true });
    },
    [filters, setSearch],
  );

  const facets = useUsage<Facets>('api/facets', {}, [tick]);
  const refresh = useCallback(() => setTick((n) => n + 1), []);

  // Left open on a second monitor, this should not quietly go stale.
  useEffect(() => {
    const t = setInterval(refresh, 60_000);
    return () => clearInterval(t);
  }, [refresh]);

  const ctx: DashboardContext = {
    filters,
    params: useMemo(() => filterParams(filters), [filters]),
    tick,
    refresh,
    setLoading,
    setNote,
  };

  // Nothing until the gate has answered — a flash of the dashboard followed by
  // a login screen is worse than a moment of nothing.
  if (gate === null) return <div className="min-h-screen bg-canvas" />;

  // Accounts exist and this browser has none: the front door, not the frame.
  // Where a deployment uses only the shared token there are no accounts to
  // sign in to, so the connection dialog remains the way in.
  if (gate.accounts && !gate.signedIn) {
    return <SignIn onSignedIn={check} />;
  }

  return (
    <div className="min-h-screen">
      <Sidebar
        active={pathname}
        open={menu}
        onClose={() => setMenu(false)}
        onSettings={() => setConnecting(true)}
        theme={theme}
        onTheme={toggle}
      />

      <div className="lg:ml-[236px]">
        <Topbar
          filters={filters}
          facets={facets.data}
          onChange={change}
          onRefresh={refresh}
          loading={loading}
          onMenu={() => setMenu((m) => !m)}
          note={note}
        />
        <main className="grid gap-4 px-5 pb-20 pt-5">{children(ctx)}</main>
      </div>

      <Connect open={connecting} onClose={() => setConnecting(false)} onSaved={refresh} />
    </div>
  );
}
