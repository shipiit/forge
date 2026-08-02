import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  label: string;
  to: string;
  desc: string;
  Icon?: LucideIcon;
}

export interface NavGroup {
  heading: string;
  items: NavItem[];
}

/**
 * A hover/focus dropdown with grouped items.
 *
 * Opens on hover for pointer users and on click/Enter for everyone else, closes
 * on Escape, outside click, and blur — so it is usable without a mouse and never
 * gets stuck open on touch, where hover has no counterpart.
 */
export function NavMenu({ label, groups }: { label: string; groups: NavGroup[] }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const cols = groups.length > 1 ? 'sm:grid-cols-2' : '';

  return (
    <div
      ref={wrap}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 uppercase tracking-[0.12em] transition-colors hover:text-text"
      >
        {label}
        <ChevronDown size={13} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      <div
        id={id}
        role="menu"
        className={`absolute left-1/2 top-full z-50 w-[min(90vw,640px)] -translate-x-1/2 pt-4 transition-all duration-200 ${
          open ? 'visible translate-y-0 opacity-100' : 'invisible -translate-y-1 opacity-0'
        }`}
      >
        <div className="panel overflow-hidden !rounded-xl shadow-glow">
          <div className={`grid gap-px bg-white/[0.06] ${cols}`}>
            {groups.map((g) => (
              <div key={g.heading} className="bg-[rgb(11_11_14)] p-5">
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">{g.heading}</div>
                <ul className="mt-3 space-y-0.5">
                  {g.items.map((it) => (
                    <li key={it.label}>
                      <Link
                        role="menuitem"
                        to={it.to}
                        onClick={() => setOpen(false)}
                        className="group flex gap-3 rounded-lg p-2.5 transition-colors hover:bg-white/[0.05]"
                      >
                        {it.Icon && (
                          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70 transition-colors group-hover:text-text">
                            <it.Icon size={14} />
                          </span>
                        )}
                        <span className="min-w-0">
                          <span className="block text-[13px] font-semibold normal-case tracking-normal text-text">
                            {it.label}
                          </span>
                          <span className="mt-0.5 block text-[12px] normal-case leading-snug tracking-normal text-muted">
                            {it.desc}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
