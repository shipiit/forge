import { useEffect, useRef } from 'react';
import { Link, NavLink, useSearchParams } from 'react-router-dom';
import type { Facets, Filters } from '../../lib/usage';

/**
 * The dashboard frame: a fixed rail of sections on the left, filters across the
 * top. Both are pure — every piece of state lives on the page, so the frame can
 * be read without tracing where a value came from.
 */

/* Inline, single-stroke icons. A pack for eleven glyphs would be more bytes
   than the whole dashboard. */
const I = ({ d, fill }: { d: string; fill?: boolean }) => (
  <svg viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
    <path d={d} />
  </svg>
);

export const ICONS = {
  overview: 'M3 12h4l3 8 4-16 3 8h4',
  spend: 'M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  flow: 'M4 6h6M4 12h16M4 18h10M14 3l3 3-3 3M20 15l-3 3 3 3',
  model: 'M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM12 12l8-4.5M12 12v9M12 12L4 7.5',
  repo: 'M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15zM4 17.5A2.5 2.5 0 0 1 6.5 15H20',
  runs: 'M5 3l14 9-14 9V3z',
  tools: 'M14.7 6.3a4 4 0 0 1-5 5L4 17v3h3l5.7-5.7a4 4 0 0 1 5-5l2-2-3-3-2 2z',
  findings: 'M12 3l8 4v5c0 5-3.4 8.4-8 9-4.6-.6-8-4-8-9V7l8-4zM12 8v5M12 16h.01',
  cache: 'M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.5 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 13.9H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7.5l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9.4a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6',
  back: 'M15 18l-6-6 6-6',
  close: 'M6 6l12 12M18 6L6 18',
};

const NAV = [
  { to: '/dashboard', label: 'Overview', icon: ICONS.overview, group: '', end: true },
  { to: '/dashboard/runs', label: 'Runs', icon: ICONS.runs, group: 'Activity' },
  { to: '/dashboard/events', label: 'Events', icon: ICONS.flow, group: 'Activity' },
  { to: '/dashboard/tools', label: 'Tool reliability', icon: ICONS.tools, group: 'Activity' },
  { to: '/dashboard/findings', label: 'Findings', icon: ICONS.findings, group: 'Activity' },
  { to: '/dashboard#spend', label: 'Spend & volume', icon: ICONS.spend, group: 'Analytics' },
  { to: '/dashboard#models', label: 'By model', icon: ICONS.model, group: 'Analytics' },
  { to: '/dashboard#repos', label: 'By repository', icon: ICONS.repo, group: 'Analytics' },
  { to: '/dashboard#cache', label: 'Cache & tokens', icon: ICONS.cache, group: 'Analytics' },
];

export function Sidebar({ active, open, onClose, onSettings, theme, onTheme }: {
  /** The current pathname; nav items highlight against it. */
  active: string;
  open: boolean;
  onClose: () => void;
  onSettings: () => void;
  theme: 'dark' | 'light';
  onTheme: () => void;
}) {
  // Filters live in the query string, so every nav link has to carry them:
  // switching to the run log must not drop the window somebody chose.
  const [search] = useSearchParams();
  const qs = search.toString();
  let lastGroup = '';
  return (
    <aside
      className={`fixed inset-y-0 left-0 z-30 flex w-[236px] flex-col border-r border-line/[0.08] bg-rail px-3 pb-3 pt-4 transition-transform duration-200 lg:translate-x-0 ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <Link to="/" className="flex items-center gap-2.5 px-2.5 pb-5 text-[15.5px] font-semibold">
        <span className="grid h-7 w-7 place-items-center rounded-[9px] bg-gradient-to-br from-forge1 to-forge2 text-white">◆</span>
        Forge
      </Link>

      <nav className="flex-1 overflow-y-auto">
        {NAV.map((item) => {
          const header = item.group && item.group !== lastGroup ? item.group : '';
          lastGroup = item.group || lastGroup;
          const [path, hash] = item.to.split('#');
          const to = `${path}${qs ? `?${qs}` : ''}${hash ? `#${hash}` : ''}`;
          const on = !hash && (item.end ? active === path : active.startsWith(path!));
          return (
            <div key={item.to}>
              {header && <div className="px-2.5 pb-1.5 pt-4 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-faint">{header}</div>}
              <NavLink
                to={to}
                onClick={onClose}
                className={`flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[13px] transition-colors duration-150 ${
                  on ? 'bg-accent/[0.16] text-text' : 'text-muted hover:bg-line/[0.05] hover:text-text'
                }`}
              >
                <span className={on ? 'text-accent' : ''}>
                  <I d={item.icon} />
                </span>
                {item.label}
              </NavLink>
            </div>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-line/[0.08] pt-3">
        <button onClick={onSettings} className="flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[13px] text-muted transition-colors duration-150 hover:bg-line/[0.05] hover:text-text">
          <I d={ICONS.settings} />
          Connection
        </button>
        <div className="flex items-center justify-between px-2.5 py-2 text-[12.5px] text-muted">
          <span>{theme === 'dark' ? 'Dark mode' : 'Light mode'}</span>
          <button
            role="switch"
            aria-checked={theme === 'dark'}
            aria-label="Toggle dark mode"
            onClick={onTheme}
            className={`relative h-[21px] w-[38px] rounded-full border border-line/[0.08] transition-colors duration-150 ${theme === 'dark' ? 'bg-accent/40' : 'bg-line/[0.07]'}`}
          >
            <span
              className={`absolute top-[2px] h-[15px] w-[15px] rounded-full transition-transform duration-150 ${
                theme === 'dark' ? 'translate-x-[19px] bg-accent' : 'translate-x-[2px] bg-muted'
              }`}
            />
          </button>
        </div>
      </div>
    </aside>
  );
}

const RANGES = [
  { days: 1, label: '24h' },
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
  { days: 3650, label: 'All' },
];

export function Topbar({ filters, facets, onChange, onRefresh, loading, onMenu, note }: {
  filters: Filters;
  facets: Facets | undefined;
  onChange: (next: Partial<Filters>) => void;
  onRefresh: () => void;
  loading: boolean;
  onMenu: () => void;
  /** What the page wants to say about what is in view. */
  note: string;
}) {
  // Debounced: every keystroke rewrites the URL, and every page here re-runs
  // ten queries off that — each a nine-column LIKE scan.
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);

  const select = 'appearance-none rounded-[9px] border border-line/[0.08] bg-panel/80 px-3 py-1.5 text-[12.5px] text-text hover:border-line/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';

  return (
    <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-line/[0.08] bg-canvas/[0.86] px-5 py-3 backdrop-blur">
      <button onClick={onMenu} aria-label="Open navigation" className="grid h-[33px] w-[33px] place-items-center rounded-[9px] border border-line/[0.08] bg-panel/80 text-muted lg:hidden">
        <I d="M4 6h16M4 12h16M4 18h16" />
      </button>
      <h1 className="text-[15px] font-semibold">Usage</h1>

      <div className="inline-flex gap-0.5 rounded-[10px] border border-line/[0.08] bg-panel/80 p-[3px]">
        {RANGES.map((r) => (
          <button
            key={r.days}
            aria-pressed={filters.days === r.days}
            onClick={() => onChange({ days: r.days })}
            className={`rounded-[7px] px-3 py-1 text-[12.5px] transition-colors duration-150 ${
              filters.days === r.days ? 'bg-accent text-white' : 'text-muted hover:text-text'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <select className={select} value={filters.repo} onChange={(e) => onChange({ repo: e.target.value })} aria-label="Repository">
        <option value="">All repositories</option>
        {facets?.repos.map((r) => <option key={r}>{r}</option>)}
      </select>
      <select className={select} value={filters.flow} onChange={(e) => onChange({ flow: e.target.value })} aria-label="Flow">
        <option value="">All flows</option>
        {facets?.flows.map((f) => <option key={f}>{f}</option>)}
      </select>
      {(facets?.skills.length ?? 0) > 0 && (
        <select className={select} value={filters.skill} onChange={(e) => onChange({ skill: e.target.value })} aria-label="Skill">
          <option value="">All skills</option>
          {facets?.skills.map((s) => <option key={s}>{s}</option>)}
        </select>
      )}
      <select className={select} value={filters.status} onChange={(e) => onChange({ status: e.target.value })} aria-label="Status">
        <option value="">Any status</option>
        {facets?.statuses.map((s) => <option key={s}>{s}</option>)}
      </select>
      <input
        type="search"
        placeholder="Search repo, actor, error…"
        defaultValue={filters.q}
        onChange={(e) => {
          const q = e.target.value.trim();
          clearTimeout(timer.current);
          timer.current = setTimeout(() => onChange({ q }), 260);
        }}
        aria-label="Search runs"
        className="min-w-[210px] rounded-[9px] border border-line/[0.08] bg-panel/80 px-3 py-1.5 text-[12.5px] text-text placeholder:text-faint hover:border-line/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      />

      <span className="ml-auto text-xs text-faint">{note}</span>
      <button
        onClick={onRefresh}
        aria-label="Refresh"
        className="grid h-[33px] w-[33px] place-items-center rounded-[9px] border border-line/[0.08] bg-panel/80 text-muted transition-colors hover:text-text active:scale-95"
      >
        <span className={loading ? 'animate-spinslow' : ''}>
          <I d={ICONS.refresh} />
        </span>
      </button>
    </header>
  );
}

export function Icon({ name }: { name: keyof typeof ICONS }) {
  return <I d={ICONS[name]} />;
}

export function Card({ title, hint, action, children, id, className = '' }: {
  title?: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <section id={id} className={`scroll-mt-20 rounded-2xl border border-line/[0.08] bg-panel p-[18px] shadow-glow ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-start gap-3">
          <div className="flex-1">
            {title && <h2 className="text-[14.5px] font-semibold">{title}</h2>}
            {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
