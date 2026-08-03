import { useMemo, useState, type ReactNode } from 'react';
import { Empty } from './charts';

/**
 * One table, used by every page.
 *
 * Built rather than styled ad hoc because a dashboard is mostly tables, and
 * four hand-rolled ones drift: different row heights, different alignment for
 * the same kind of number, headers that scroll away on the long pages and not
 * on the short ones.
 */

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** Numbers go right; everything else left. */
  align?: 'left' | 'right';
  /** Return the value to sort on. Omit to make the column unsortable. */
  sortBy?: (row: T) => number | string;
  /** Fixed width, for columns that would otherwise jump between pages. */
  width?: string;
  cell: (row: T) => ReactNode;
}

export interface TableProps<T> {
  rows: T[];
  columns: Array<Column<T>>;
  rowKey: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  /** Accent stripe down the left of a row: status, severity, anything. */
  accent?: (row: T) => string | undefined;
  empty?: { title: string; body: string };
  loading?: boolean;
  /** Column key to sort by initially, prefixed with `-` for descending. */
  defaultSort?: string;
}

const CHEVRON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
    <path d="M9 18l6-6-6-6" />
  </svg>
);

function SortMark({ dir }: { dir: 'asc' | 'desc' | undefined }) {
  if (!dir) return <span className="ml-1 inline-block w-2 opacity-0 group-hover:opacity-40">↑</span>;
  return <span className="ml-1 inline-block w-2 text-accent">{dir === 'asc' ? '↑' : '↓'}</span>;
}

export function Table<T>({ rows, columns, rowKey, onRowClick, accent, empty, loading, defaultSort }: TableProps<T>) {
  const [sort, setSort] = useState(defaultSort ?? '');
  const desc = sort.startsWith('-');
  const sortKey = desc ? sort.slice(1) : sort;

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortBy) return rows;
    const by = col.sortBy;
    return [...rows].sort((a, b) => {
      const x = by(a);
      const y = by(b);
      const cmp = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return desc ? -cmp : cmp;
    });
  }, [rows, columns, sortKey, desc]);

  if (loading && rows.length === 0) {
    return (
      <div className="grid gap-1.5 py-1">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-lg bg-line/[0.045]" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return <Empty title={empty?.title}>{empty?.body ?? 'Nothing to show yet.'}</Empty>;
  }

  return (
    <div className="-mx-[18px] -mb-[18px] overflow-x-auto rounded-b-2xl">
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="border-y border-line/[0.07] bg-line/[0.02]">
            {columns.map((c) => {
              const active = sortKey === c.key;
              const dir = active ? (desc ? 'desc' : 'asc') : undefined;
              return (
                <th
                  key={c.key}
                  scope="col"
                  style={c.width ? { width: c.width } : undefined}
                  className={`whitespace-nowrap px-3.5 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] ${
                    c.align === 'right' ? 'text-right' : 'text-left'
                  } ${active ? 'text-text' : 'text-faint'}`}
                >
                  {c.sortBy ? (
                    <button
                      className="group inline-flex items-center transition-colors hover:text-text"
                      // Descending first: on every column here, the interesting
                      // end is the big one — most spend, most failures, slowest.
                      onClick={() => setSort(active && desc ? c.key : `-${c.key}`)}
                      aria-label={`Sort by ${c.key}`}
                    >
                      {c.header}
                      <SortMark dir={dir} />
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
            {onRowClick && <th className="w-8" aria-label="Open" />}
          </tr>
        </thead>

        <tbody>
          {sorted.map((row, i) => {
            const stripe = accent?.(row);
            return (
              <tr
                key={rowKey(row, i)}
                {...(onRowClick
                  ? {
                      tabIndex: 0,
                      onClick: () => onRowClick(row),
                      onKeyDown: (e: React.KeyboardEvent) => e.key === 'Enter' && onRowClick(row),
                    }
                  : {})}
                className={`group border-b border-line/[0.045] transition-colors duration-150 last:border-0 ${
                  onRowClick ? 'cursor-pointer hover:bg-line/[0.035] focus-visible:bg-line/[0.05] focus-visible:outline-none' : ''
                }`}
              >
                {columns.map((c, ci) => (
                  <td
                    key={c.key}
                    className={`relative px-3.5 py-3 align-middle ${c.align === 'right' ? 'text-right tabular-nums' : 'text-left'}`}
                  >
                    {/* The stripe rides the first cell so it needs no extra column. */}
                    {ci === 0 && stripe && (
                      <span className="absolute inset-y-1 left-0 w-[3px] rounded-full" style={{ background: stripe }} aria-hidden="true" />
                    )}
                    {c.cell(row)}
                  </td>
                ))}
                {onRowClick && (
                  <td className="pr-3 text-faint transition-colors group-hover:text-muted" aria-hidden="true">
                    {CHEVRON}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** A monospace identifier that should recede until you look for it. */
export function Mono({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'accent' | 'text' }) {
  const color = tone === 'accent' ? 'text-accent' : tone === 'text' ? 'text-text' : 'text-muted';
  return <span className={`font-mono text-[11.5px] ${color}`}>{children}</span>;
}

/** A name in a soft chip: tool names, event names, categories. */
export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded-md bg-line/[0.06] px-1.5 py-0.5 font-mono text-[11.5px] text-muted">{children}</span>
  );
}

/** Primary line with a quieter second line under it, inside one cell. */
export function Stacked({ top, bottom }: { top: ReactNode; bottom: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="truncate">{top}</div>
      <div className="mt-0.5 truncate text-[11px] text-faint">{bottom}</div>
    </div>
  );
}
