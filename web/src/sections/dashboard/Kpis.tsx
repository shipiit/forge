import { Sparkline } from './charts';
import { Icon } from './Shell';
import { delta, fmtMs, fmtNum, fmtPct, fmtUsd, type Delta } from '../../lib/format';
import type { DayRow, Summary } from '../../lib/usage';

/**
 * The headline row.
 *
 * Every card carries three things: the number, how it moved against the
 * previous period of the same length, and the shape it moved in. A number on
 * its own says nothing about whether it is normal.
 */

interface CardSpec {
  label: string;
  icon: 'spend' | 'runs' | 'cache' | 'tools' | 'findings' | 'overview';
  tint: string;
  value: string;
  delta?: Delta;
  /** True when going up is the bad direction — spend, failures, latency. */
  inverse?: boolean;
  sub: string;
  series: number[];
  color?: string;
}

function DeltaBadge({ d, inverse }: { d: Delta; inverse?: boolean }) {
  if (d.dir === 'flat') return <span className="text-xs font-semibold text-faint">no change</span>;
  const good = inverse ? d.dir === 'down' : d.dir === 'up';
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${good ? 'text-ok' : 'text-bad'}`}>
      {d.dir === 'up' ? '↑' : '↓'} {fmtPct(d.pct, d.pct < 10 ? 1 : 0)}
    </span>
  );
}

function Kpi({ spec }: { spec: CardSpec }) {
  return (
    <div className="rounded-2xl border border-line/[0.08] bg-panel p-[18px] shadow-glow">
      <div className="flex items-center gap-3">
        <span className="grid h-[38px] w-[38px] place-items-center rounded-[11px]" style={{ background: `rgb(var(--${spec.tint}) / 0.16)`, color: `rgb(var(--${spec.tint}))` }}>
          <Icon name={spec.icon} />
        </span>
        <span className="text-[12.5px] font-medium text-muted">{spec.label}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-2.5">
        <b className="text-[25px] font-semibold tabular-nums tracking-[-0.03em]">{spec.value}</b>
        {spec.delta && <DeltaBadge d={spec.delta} inverse={spec.inverse} />}
      </div>
      <div className="mt-0.5 text-[11.5px] text-faint">{spec.sub}</div>
      <Sparkline values={spec.series} color={spec.color ?? `rgb(var(--${spec.tint}))`} className="mt-3" />
    </div>
  );
}

export function Kpis({ now, before, days }: { now: Summary | undefined; before: Summary | undefined; days: DayRow[] }) {
  if (!now) {
    return (
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(216px, 1fr))' }}>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="rounded-2xl border border-line/[0.08] bg-panel p-[18px]">
            <div className="h-3 w-24 animate-pulse rounded bg-line/[0.07]" />
            <div className="mt-4 h-6 w-28 animate-pulse rounded bg-line/[0.07]" />
            <div className="mt-4 h-9 animate-pulse rounded bg-line/[0.05]" />
          </div>
        ))}
      </div>
    );
  }

  const runRate = now.runs ? (now.ok / now.runs) * 100 : 0;
  const prevRate = before?.runs ? (before.ok / before.runs) * 100 : 0;
  const perRun = now.runs ? now.usd / now.runs : 0;
  const prevPerRun = before?.runs ? before.usd / before.runs : 0;
  const tokens = now.inputTokens + now.outputTokens + now.cacheRead;
  const prevTokens = before ? before.inputTokens + before.outputTokens + before.cacheRead : 0;
  const cacheHit = now.inputTokens + now.cacheRead ? (now.cacheRead / (now.inputTokens + now.cacheRead)) * 100 : 0;

  const specs: CardSpec[] = [
    {
      label: 'Total spend',
      icon: 'spend',
      tint: 'accent',
      value: fmtUsd(now.usd),
      delta: before ? delta(now.usd, before.usd) : undefined,
      inverse: true,
      sub: now.saved > 0 ? `${fmtUsd(now.saved)} saved by caching` : 'vs the period before',
      series: days.map((d) => Number(d.usd)),
    },
    {
      label: 'Runs',
      icon: 'runs',
      tint: 'info',
      value: fmtNum(now.runs),
      delta: before ? delta(now.runs, before.runs) : undefined,
      sub: now.running ? `${now.running} in flight now` : `${now.failed} failed · ${now.skipped} skipped`,
      series: days.map((d) => Number(d.runs)),
    },
    {
      label: 'Tokens',
      icon: 'cache',
      tint: 'teal',
      value: fmtNum(tokens),
      delta: before ? delta(tokens, prevTokens) : undefined,
      sub: `${fmtPct(cacheHit, 0)} served from cache`,
      series: days.map((d) => Number(d.tokens)),
    },
    {
      label: 'Cost per run',
      icon: 'overview',
      tint: 'accent-warm',
      value: fmtUsd(perRun, true),
      delta: before ? delta(perRun, prevPerRun) : undefined,
      inverse: true,
      sub: `median ${fmtMs(now.medianMs)} · p95 ${fmtMs(now.p95Ms)}`,
      series: days.map((d) => (Number(d.runs) ? Number(d.usd) / Number(d.runs) : 0)),
    },
    {
      label: 'Success rate',
      icon: 'findings',
      tint: 'ok',
      value: fmtPct(runRate),
      delta: before ? delta(runRate, prevRate) : undefined,
      sub: `${now.ok} of ${now.runs} completed`,
      series: days.map((d) => {
        const r = Number(d.runs);
        return r ? ((r - Number(d.failed)) / r) * 100 : 0;
      }),
    },
  ];

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(216px, 1fr))' }}>
      {specs.map((s) => (
        <Kpi key={s.label} spec={s} />
      ))}
    </div>
  );
}
