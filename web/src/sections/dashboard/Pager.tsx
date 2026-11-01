import { ChevronLeft, ChevronRight } from 'lucide-react';
import { fmtNum } from '../../lib/format';

interface PagerProps {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  /** What is being paged, for the label: "findings", "runs". */
  noun: string;
}

/** "51–100 of 342" with previous and next. Nothing at all when everything fits on one page. */
export function Pager({ page, pageSize, total, onPage, noun }: PagerProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  const from = page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  const btn =
    'grid h-8 w-8 place-items-center rounded-[9px] border border-line/[0.1] text-muted transition-colors hover:text-text disabled:cursor-not-allowed disabled:opacity-35';
  return (
    <nav aria-label={`${noun} pages`} className="flex items-center justify-between gap-3 border-t border-line/[0.06] px-4 py-3 text-[12.5px] text-muted">
      <span>
        <span className="tabular-nums text-text">{fmtNum(from)}–{fmtNum(to)}</span> of <span className="tabular-nums">{fmtNum(total)}</span> {noun}
      </span>
      <span className="flex items-center gap-2">
        <span className="tabular-nums">Page {page + 1} of {pages}</span>
        <button className={btn} onClick={() => onPage(page - 1)} disabled={page === 0} aria-label="Previous page">
          <ChevronLeft size={15} aria-hidden />
        </button>
        <button className={btn} onClick={() => onPage(page + 1)} disabled={page >= pages - 1} aria-label="Next page">
          <ChevronRight size={15} aria-hidden />
        </button>
      </span>
    </nav>
  );
}
