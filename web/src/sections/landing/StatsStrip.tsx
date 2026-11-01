const STATS: Array<[string, string, string]> = [
  ['4', 'deterministic scanners', 'before any model call'],
  ['3', 'focused reviewers', 'at review_depth: deep'],
  ['2', 'agents per finding', 'one finds, one checks'],
  ['0', 'merges without you', 'it never approves'],
];

export function StatsStrip() {
  return (
    <section aria-label="At a glance" className="px-7 pb-20">
      <dl className="mx-auto grid max-w-7xl border-t border-white/[0.08] sm:grid-cols-2 lg:grid-cols-4">
        {STATS.map(([n, label, sub], i) => (
          <div key={label} className={`flex items-center gap-5 py-7 lg:px-8 ${i ? 'lg:border-l lg:border-white/[0.08]' : 'lg:pl-0'}`}>
            <dt className="order-2 text-sm leading-snug">
              <span className="block text-text">{label}</span>
              <span className="block text-muted">{sub}</span>
            </dt>
            <dd className="display order-1 text-[52px] tabular-nums">{n}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
