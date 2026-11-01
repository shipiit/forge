import { useId, useRef } from 'react';
import { motion } from 'framer-motion';
import { Cpu, Eye, Send, ShieldCheck, type LucideIcon } from 'lucide-react';
import type { HubTab } from '../lib/hub';

const ICONS: Record<HubTab['tabIcon'], LucideIcon> = { eye: Eye, shield: ShieldCheck, send: Send, cpu: Cpu };

interface HubTabsProps {
  tabs: HubTab[];
  active: number;
  onChange: (index: number) => void;
  /** Prefix for the tab and panel ids, so the panel can name its tab. */
  idPrefix: string;
}

/** The hub's tab bar: WAI-ARIA tabs, arrow keys and Home/End, with a sliding marker. */
export function HubTabs({ tabs, active, onChange, idPrefix }: HubTabsProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
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
    onChange(next);
    refs.current[next]?.focus();
  };

  return (
    <div role="tablist" aria-label="What Forge works with" onKeyDown={onKeyDown} className="flex flex-wrap border border-white/[0.08] bg-white/[0.02]">
      {tabs.map((t, i) => {
        const Icon = ICONS[t.tabIcon];
        const on = i === active;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={`${idPrefix}-tab-${t.id}`}
            role="tab"
            aria-selected={on}
            aria-controls={`${idPrefix}-panel`}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(i)}
            className={`relative flex items-center gap-2.5 px-5 py-3.5 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white/50 ${
              on ? 'text-text' : 'text-white/55 hover:text-white/85'
            }`}
          >
            <Icon size={15} className={on ? 'text-accentWarm' : ''} aria-hidden />
            <span className="font-medium">{t.label}</span>
            <span
              className={`border px-1.5 font-mono text-[10.5px] tabular-nums ${on ? 'border-accentWarm/40 text-accentWarm' : 'border-white/10 text-white/45'}`}
              aria-label={`${t.left.length + t.right.length} items`}
            >
              {t.left.length + t.right.length}
            </span>
            {on && (
              <motion.span
                layoutId={`${uid}-hub-tab`}
                className="absolute inset-x-0 -bottom-px h-0.5 bg-accentWarm"
                transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                aria-hidden
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
