import { Children, useState, type ReactNode } from 'react';
import { AlertCircle, Check } from 'lucide-react';

/**
 * Shows one form section at a time.
 *
 * The builder has five groups of questions; stacked, that is a long scroll and
 * the live preview drifts off screen. Tabs keep the whole form one screen tall
 * so the preview stays beside it the entire time.
 *
 * A section with an unresolved required field is marked, so switching tabs never
 * hides a problem — you can always see where the remaining work is.
 */
export function FormTabs({
  labels,
  /** Indices of sections that still have an unmet requirement. */
  invalid = [],
  /** Indices of sections the user has satisfied. */
  complete = [],
  children,
}: {
  labels: string[];
  invalid?: number[];
  complete?: number[];
  children: ReactNode;
}) {
  const [active, setActive] = useState(0);
  const panels = Children.toArray(children);
  const last = labels.length - 1;

  const move = (next: number) => setActive(Math.max(0, Math.min(last, next)));

  return (
    <div>
      <div
        role="tablist"
        aria-label="Configuration sections"
        className="flex flex-wrap gap-1 rounded-xl border border-white/[0.08] bg-white/[0.02] p-1"
      >
        {labels.map((label, i) => {
          const selected = i === active;
          const hasIssue = invalid.includes(i);
          const done = !hasIssue && complete.includes(i);
          return (
            <button
              key={label}
              role="tab"
              type="button"
              aria-selected={selected}
              onClick={() => setActive(i)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50 motion-reduce:transition-none ${
                selected
                  ? 'bg-white/[0.09] font-medium text-text shadow-insetLine'
                  : 'text-muted hover:bg-white/[0.04] hover:text-text'
              }`}
            >
              {hasIssue && <AlertCircle size={12} aria-hidden className="text-amber-300/90" />}
              {done && <Check size={12} aria-hidden className="text-[rgb(var(--syn-string))]" />}
              {label}
              {hasIssue && <span className="sr-only"> — has an unresolved required field</span>}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" aria-label={labels[active]} className="mt-4">
        {panels[active]}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => move(active - 1)}
          disabled={active === 0}
          className="rounded-lg border border-white/[0.09] px-3.5 py-2 text-[12.5px] text-muted transition-colors hover:border-white/25 hover:text-text disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={() => move(active + 1)}
          disabled={active === last}
          className="rounded-lg border border-white/[0.09] px-3.5 py-2 text-[12.5px] text-text transition-colors hover:border-white/25 hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50"
        >
          Next →
        </button>
        <span className="ml-auto text-[11.5px] text-muted">
          Step {active + 1} of {labels.length}
        </span>
      </div>
    </div>
  );
}
