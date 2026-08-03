/**
 * Formatting for numbers people compare at a glance.
 *
 * Pinned to en-US throughout: a figure read off this dashboard gets pasted into
 * a spreadsheet or a message, and a viewer on an en-IN locale would otherwise
 * see 9,00,000 where a colleague sees 900,000.
 */
const nf = new Intl.NumberFormat('en-US');

export function fmtNum(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e4) return `${(v / 1e3).toFixed(1)}k`;
  return nf.format(Math.round(v));
}

export function fmtUsd(n: number | string | null | undefined, precise = false): string {
  const v = Number(n ?? 0);
  if (v === 0) return '$0.00';
  if (precise || v < 1) return `$${v.toFixed(v < 0.01 ? 4 : 2)}`;
  return `$${nf.format(Number(v.toFixed(2)))}`;
}

export function fmtMs(ms: number | string | null | undefined): string {
  const v = Number(ms ?? 0);
  if (!v) return '—';
  if (v < 1000) return `${Math.round(v)}ms`;
  if (v < 60_000) return `${(v / 1000).toFixed(1)}s`;
  const m = Math.floor(v / 60_000);
  return `${m}m ${Math.round((v % 60_000) / 1000)}s`;
}

export function fmtPct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

export function fmtWhen(ts: number | null | undefined): string {
  if (!ts) return '—';
  return new Date(Number(ts)).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function fmtAgo(ts: number | null | undefined): string {
  if (!ts) return '—';
  const d = Date.now() - Number(ts);
  if (d < 60_000) return 'just now';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  return `${Math.floor(d / 86_400_000)}d ago`;
}

/** Vendor prefixes that appear in fully-qualified model ids. */
const VENDORS = /^(anthropic|amazon|meta|mistral|cohere|ai21|google|deepseek|qwen|us|eu|apac)\./;

/**
 * Short model label: the family, not the routing path.
 *
 * Only a known vendor prefix is stripped. Cutting at the last dot would turn
 * `gpt-4.1` into `1`, which is how a legend ends up labelled with a number.
 */
export function shortModel(model: string): string {
  const last = String(model || '').split('/').pop() ?? '';
  return last.replace(VENDORS, '');
}

export interface Delta {
  pct: number;
  dir: 'up' | 'down' | 'flat';
}

/**
 * Change against the previous period.
 *
 * Growing from zero has no percentage — "+∞%" is noise, so it reports flat and
 * the caller shows the raw number instead.
 */
export function delta(now: number, before: number): Delta {
  if (!before) return { pct: 0, dir: 'flat' };
  const pct = ((now - before) / before) * 100;
  if (Math.abs(pct) < 0.5) return { pct: 0, dir: 'flat' };
  return { pct: Math.abs(pct), dir: pct > 0 ? 'up' : 'down' };
}

/** The series palette, in the order charts should consume it. */
export const SERIES = [
  'rgb(var(--accent))',
  'rgb(var(--info))',
  'rgb(var(--teal))',
  'rgb(var(--accent-warm))',
  'rgb(var(--accent2))',
  'rgb(var(--ok))',
  'rgb(var(--warn))',
  'rgb(var(--muted))',
] as const;

export const seriesColor = (i: number): string => SERIES[i % SERIES.length]!;
