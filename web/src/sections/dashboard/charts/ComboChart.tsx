import { useId, useState } from 'react';
import { fmtNum, fmtUsd } from '../../../lib/format';
import { smoothPath } from './path';
import { Empty } from './Empty';

export interface ComboPoint {
  label: string;
  bar: number;
  line: number;
  extra?: string;
}

/**
 * Runs as bars against cost as a line — two scales on purpose. A cheap busy day
 * and an expensive quiet one are both worth seeing, and a shared axis would
 * flatten whichever series happens to be smaller into the baseline.
 */
export function ComboChart({ points, barName, lineName }: { points: ComboPoint[]; barName: string; lineName: string }) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  if (!points.length) return <Empty>No runs in this window.</Empty>;

  const W = 900;
  const H = 250;
  const L = 48;
  const R = 54;
  const T = 14;
  const B = 30;
  const maxBar = Math.max(...points.map((p) => p.bar), 1);
  const maxLine = Math.max(...points.map((p) => p.line), 0.000_001);
  const iw = W - L - R;
  const step = iw / Math.max(1, points.length);
  const cx = (i: number) => L + step * (i + 0.5);
  const by = (v: number) => H - B - (v / maxBar) * (H - T - B);
  const ly = (v: number) => H - B - (v / maxLine) * (H - T - B);
  const curve = smoothPath(points.map((p, i) => [cx(i), ly(p.line)]));
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const every = Math.max(1, Math.ceil(points.length / 9));
  const barW = Math.max(3, Math.min(24, step * 0.58));
  const active = hover === null ? null : points[hover]!;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 250 }} role="img" aria-label={`${barName} and ${lineName} by day`}>
        <defs>
          <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity="1" />
            <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity="0.32" />
          </linearGradient>
          <linearGradient id={`${id}a`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--accent2))" stopOpacity="0.2" />
            <stop offset="100%" stopColor="rgb(var(--accent2))" stopOpacity="0" />
          </linearGradient>
        </defs>

        {ticks.map((t) => {
          const y = H - B - t * (H - T - B);
          return (
            <g key={t}>
              <line x1={L} x2={W - R} y1={y} y2={y} stroke="rgb(var(--line) / 0.07)" />
              <text x={L - 10} y={y + 3.5} textAnchor="end" className="fill-faint font-mono text-[10px]">
                {fmtNum(Math.round(maxBar * t))}
              </text>
              <text x={W - R + 10} y={y + 3.5} className="fill-faint font-mono text-[10px]">
                {fmtUsd(maxLine * t, maxLine < 10)}
              </text>
            </g>
          );
        })}

        {hover !== null && <line x1={cx(hover)} x2={cx(hover)} y1={T - 6} y2={H - B} stroke="rgb(var(--line) / 0.16)" strokeDasharray="3 3" />}

        {points.map((p, i) => (
          <rect
            key={p.label}
            x={cx(i) - barW / 2}
            y={by(p.bar)}
            width={barW}
            height={Math.max(2, H - B - by(p.bar))}
            rx={Math.min(4, barW / 2)}
            fill={`url(#${id}b)`}
            opacity={hover === null || hover === i ? 1 : 0.32}
            className="transition-opacity duration-150"
          />
        ))}

        <path d={`${curve} L${cx(points.length - 1)} ${H - B} L${cx(0)} ${H - B} Z`} fill={`url(#${id}a)`} />
        <path
          d={curve}
          fill="none"
          stroke="rgb(var(--accent2))"
          strokeWidth="2.2"
          strokeLinejoin="round"
          strokeLinecap="round"
          style={{ filter: 'drop-shadow(0 2px 8px rgb(var(--accent2) / 0.35))' }}
        />
        {hover !== null && <circle cx={cx(hover)} cy={ly(active!.line)} r={4.5} fill="rgb(var(--accent2))" stroke="rgb(var(--panel))" strokeWidth="2.5" />}

        {points.map((p, i) =>
          i % every === 0 ? (
            <text key={`x${p.label}`} x={cx(i)} y={H - 9} textAnchor="middle" className="fill-faint font-mono text-[10px]">
              {p.label.slice(5)}
            </text>
          ) : null,
        )}

        {points.map((p, i) => (
          <rect
            key={`h${p.label}`}
            x={L + step * i}
            y={0}
            width={step}
            height={H}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>

      {active && (
        <div
          className="pointer-events-none absolute top-1 rounded-xl border border-line/[0.1] bg-panelStrong/95 px-3 py-2 text-xs shadow-glow backdrop-blur"
          style={{ left: `${((hover! + 0.5) / points.length) * 100}%`, transform: 'translateX(-50%)' }}
        >
          <b className="mb-1.5 block text-[11px] font-semibold text-muted">{active.label}</b>
          <span className="flex items-center gap-2 whitespace-nowrap">
            <i className="h-2 w-2 rounded-sm" style={{ background: 'rgb(var(--accent))' }} />
            {fmtNum(active.bar)} {barName}
          </span>
          <span className="flex items-center gap-2 whitespace-nowrap">
            <i className="h-2 w-2 rounded-sm" style={{ background: 'rgb(var(--accent2))' }} />
            {fmtUsd(active.line, true)} {lineName}
          </span>
          {active.extra && <span className="mt-1 block whitespace-nowrap text-faint">{active.extra}</span>}
        </div>
      )}
    </div>
  );
}
