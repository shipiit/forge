import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

export function Steps({ items, link, to }: { items: [string, string, string][]; link: string; to: string }) {
  return (
    <div>
      {items.map(([n, t, d], i) => (
        <div key={n} className={`py-6 ${i ? 'row-line' : ''}`}>
          <div className="flex items-baseline gap-4">
            <span className="text-xs tabular-nums text-muted">({n})</span>
            <div>
              <h4 className="text-lg font-semibold">{t}</h4>
              <p className="mt-1 max-w-md text-sm leading-relaxed text-muted">{d}</p>
            </div>
          </div>
        </div>
      ))}
      <Link to={to} className="mt-6 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted hover:text-text">
        {link} <ArrowRight size={14} />
      </Link>
    </div>
  );
}
