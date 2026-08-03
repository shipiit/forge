import { Empty } from './Empty';

/** Ranked rows with a proportional bar. Reads faster than a pie for >5 keys. */
export function BarList({ rows, format }: { rows: Array<{ key: string; value: number; note?: string }>; format: (n: number) => string }) {
  if (!rows.length) return <Empty>Nothing recorded yet.</Empty>;
  const max = Math.max(...rows.map((r) => r.value), 0.000_001);
  return (
    <div className="grid gap-2.5">
      {rows.map((r) => (
        <div key={r.key} className="grid grid-cols-[minmax(84px,1.1fr)_2fr_auto] items-center gap-3 text-[12.5px]">
          <span className="truncate">{r.key}</span>
          <span className="h-2 overflow-hidden rounded-full bg-line/[0.06]">
            <span
              className="block h-full origin-left rounded-full bg-gradient-to-r from-forge1 to-forge2"
              style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, animation: 'grow .55s cubic-bezier(.22,1,.36,1) both' }}
            />
          </span>
          <span className="font-mono text-xs tabular-nums text-muted">{r.note ?? format(r.value)}</span>
        </div>
      ))}
    </div>
  );
}
