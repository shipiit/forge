import { useState } from 'react';
import { seriesColor } from '../../../lib/format';
import { Empty } from './Empty';

export interface Slice {
  key: string;
  value: number;
}

/** A donut and its legend. The ring carries the shape; the legend carries the numbers. */
export function Donut({ slices, total, label, format, colorOf }: {
  slices: Slice[];
  total: number;
  label: string;
  format: (n: number) => string;
  /** Override the series palette when the keys carry their own meaning. */
  colorOf?: (key: string, i: number) => string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  if (!slices.length || total <= 0) return <Empty>Nothing recorded yet.</Empty>;

  const R = 64;
  const r = 45;
  const C = 80;
  const GAP = 0.016; // a hairline between slices, so adjacent hues stay distinct
  let angle = -Math.PI / 2;

  const arcs = slices.map((s, i) => {
    const sweep = (s.value / total) * Math.PI * 2;
    const a0 = angle + (sweep > GAP * 2 ? GAP : 0);
    const a1 = angle + sweep - (sweep > GAP * 2 ? GAP : 0);
    angle += sweep;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (rad: number, a: number) => `${(C + rad * Math.cos(a)).toFixed(2)} ${(C + rad * Math.sin(a)).toFixed(2)}`;
    const full = sweep >= Math.PI * 2 - 0.001;
    return {
      key: s.key,
      color: colorOf ? colorOf(s.key, i) : seriesColor(i),
      // One slice covering the whole ring cannot be drawn as a single arc.
      d: full
        ? `M ${C - R} ${C} A ${R} ${R} 0 1 1 ${C + R} ${C} A ${R} ${R} 0 1 1 ${C - R} ${C} M ${C - r} ${C} A ${r} ${r} 0 1 0 ${C + r} ${C} A ${r} ${r} 0 1 0 ${C - r} ${C}`
        : `M ${p(R, a0)} A ${R} ${R} 0 ${large} 1 ${p(R, a1)} L ${p(r, a1)} A ${r} ${r} 0 ${large} 0 ${p(r, a0)} Z`,
    };
  });

  return (
    <div className="grid max-w-[520px] items-center gap-5 sm:grid-cols-[168px_1fr]">
      <svg viewBox="0 0 160 160" className="mx-auto w-[160px]" role="img" aria-label={label}>
        {arcs.map((a) => (
          <path
            key={a.key}
            d={a.d}
            fill={a.color}
            fillRule="evenodd"
            opacity={hover === null || hover === a.key ? 1 : 0.3}
            onMouseEnter={() => setHover(a.key)}
            onMouseLeave={() => setHover(null)}
            className="transition-opacity duration-150"
          />
        ))}
        <text x={C} y={C - 1} textAnchor="middle" className="fill-text text-[15px] font-semibold">
          {format(total)}
        </text>
        <text x={C} y={C + 15} textAnchor="middle" className="fill-faint text-[10px]">
          {label}
        </text>
      </svg>

      <div className="grid gap-2">
        {slices.map((s, i) => (
          <div
            key={s.key}
            className="grid grid-cols-[10px_1fr_auto_46px] items-center gap-2.5 text-[12.5px] transition-opacity duration-150"
            style={{ opacity: hover === null || hover === s.key ? 1 : 0.4 }}
            onMouseEnter={() => setHover(s.key)}
            onMouseLeave={() => setHover(null)}
          >
            <i className="h-2.5 w-2.5 rounded-sm" style={{ background: colorOf ? colorOf(s.key, i) : seriesColor(i) }} />
            <span className="truncate">{s.key}</span>
            <span className="font-mono text-xs tabular-nums">{format(s.value)}</span>
            <span className="text-right font-mono text-xs tabular-nums text-muted">{((s.value / total) * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
