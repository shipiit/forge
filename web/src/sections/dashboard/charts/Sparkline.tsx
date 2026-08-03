import { useId } from 'react';
import { smoothPath } from './path';

/** A trend shape, not a readable series: no axes, no labels, no tooltip. */
export function Sparkline({ values, color, className = '' }: { values: number[]; color?: string; className?: string }) {
  const id = useId();
  if (values.length < 2) return <div className={`h-9 ${className}`} />;
  const W = 120;
  const H = 34;
  // Scaled to the series' own range, not to zero. A success rate that moves
  // between 87% and 100% is a flat band against a zero baseline, and the shape
  // is the only thing a sparkline has to say.
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || Math.abs(max) || 1;
  const pts: Array<[number, number]> = values.map((v, i) => [
    (i / (values.length - 1)) * W,
    H - 3 - ((v - min) / span) * (H - 8),
  ]);
  const line = smoothPath(pts);
  const stroke = color ?? 'rgb(var(--accent))';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={`h-9 w-full ${className}`} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.3" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${W} ${H} L0 ${H} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
