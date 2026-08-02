import { useId, useState, type ReactNode } from 'react';

export interface Tab {
  id: string;
  label: string;
  /** Optional short hint shown under the panel heading. */
  hint?: string;
  content: ReactNode;
}

/**
 * Accessible tab set following the WAI-ARIA tabs pattern: roving focus with
 * arrow keys, Home/End, and `aria-controls` wiring, so it is fully usable
 * without a pointer.
 */
export function Tabs({ tabs, ariaLabel }: { tabs: Tab[]; ariaLabel: string }) {
  const [active, setActive] = useState(0);
  const uid = useId();

  const onKeyDown = (e: React.KeyboardEvent) => {
    const last = tabs.length - 1;
    const next =
      e.key === 'ArrowRight' ? (active === last ? 0 : active + 1)
      : e.key === 'ArrowLeft' ? (active === 0 ? last : active - 1)
      : e.key === 'Home' ? 0
      : e.key === 'End' ? last
      : null;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
    document.getElementById(`${uid}-tab-${next}`)?.focus();
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label={ariaLabel}
        onKeyDown={onKeyDown}
        className="flex flex-wrap gap-1 rounded-xl border border-white/[0.08] bg-white/[0.02] p-1"
      >
        {tabs.map((t, i) => {
          const selected = i === active;
          return (
            <button
              key={t.id}
              id={`${uid}-tab-${i}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`${uid}-panel-${i}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(i)}
              className={`rounded-lg px-3.5 py-2 text-[13px] font-medium transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50 motion-reduce:transition-none ${
                selected
                  ? 'bg-white/[0.09] text-text shadow-insetLine'
                  : 'text-muted hover:bg-white/[0.04] hover:text-text'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tabs.map((t, i) => (
        <div
          key={t.id}
          id={`${uid}-panel-${i}`}
          role="tabpanel"
          aria-labelledby={`${uid}-tab-${i}`}
          hidden={i !== active}
          className="mt-5"
        >
          {t.hint && <p className="mb-3 text-sm leading-relaxed text-muted">{t.hint}</p>}
          {t.content}
        </div>
      ))}
    </div>
  );
}
