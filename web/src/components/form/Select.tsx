import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface Option {
  value: string;
  label: string;
  hint?: string;
}

/**
 * Custom listbox, built rather than styling a native `<select>` — a native
 * option list cannot carry the two-line label + hint this form needs, and its
 * popup is drawn by the OS, so it would be the one control on the page that
 * ignores the theme entirely.
 *
 * Follows the WAI-ARIA listbox pattern: arrow keys move the active option,
 * Enter/Space commits, Escape closes, Home/End jump, and focus returns to the
 * trigger so tab order is never disturbed.
 */
export function Select({
  id,
  value,
  options,
  onChange,
}: {
  id?: string;
  value: string;
  options: Option[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, options.findIndex((o) => o.value === value)));
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const uid = useId();
  const listId = `${uid}-list`;

  const selected = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const commit = (index: number) => {
    const opt = options[index];
    if (!opt) return;
    onChange(opt.value);
    setOpen(false);
    trigger.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % options.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + options.length) % options.length);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActiveIndex(options.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      commit(activeIndex);
    }
  };

  return (
    <div ref={wrap} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={trigger}
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 rounded-lg border border-white/[0.09] bg-white/[0.03] px-3.5 py-2.5 text-left text-[13px] transition-colors duration-150 hover:border-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 motion-reduce:transition-none"
      >
        <span className="min-w-0 flex-1 truncate text-text">{selected?.label}</span>
        <ChevronDown
          size={14}
          aria-hidden
          className={`shrink-0 text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-activedescendant={`${uid}-opt-${activeIndex}`}
          className="panel absolute z-40 mt-2 max-h-72 w-full overflow-auto !rounded-xl p-1 shadow-glow"
        >
          {options.map((o, i) => {
            const isSelected = o.value === value;
            return (
              <li key={o.value}>
                <button
                  id={`${uid}-opt-${i}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => commit(i)}
                  className={`flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left transition-colors ${
                    i === activeIndex ? 'bg-white/[0.07]' : ''
                  }`}
                >
                  <Check
                    size={13}
                    aria-hidden
                    className={`mt-0.5 shrink-0 ${isSelected ? 'text-[rgb(var(--syn-string))]' : 'opacity-0'}`}
                  />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-text">{o.label}</span>
                    {o.hint && <span className="mt-0.5 block text-[11px] leading-snug text-muted">{o.hint}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
