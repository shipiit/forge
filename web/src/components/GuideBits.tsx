import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

export const rise = {
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
};

/** Section heading + anchor, matching the Docs page rhythm. */
export function Section({
  id, Icon, eyebrow, title, lead, children,
}: {
  id: string;
  Icon: LucideIcon;
  eyebrow: string;
  title: string;
  lead: string;
  children: ReactNode;
}) {
  return (
    <motion.section {...rise} id={id} className="scroll-mt-24 border-t border-white/[0.07] pt-16 first:border-0 first:pt-0">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5">
          <Icon size={19} />
        </span>
        <span className="eyebrow !ml-1">{eyebrow}</span>
      </div>
      <h2 className="display mt-6 text-[clamp(30px,3.4vw,46px)]">{title}</h2>
      <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-muted">{lead}</p>
      <div className="mt-8">{children}</div>
    </motion.section>
  );
}

/** "Trigger → what happens" rows — the core of how each capability is used. */
export function Triggers({ rows }: { rows: [string, string][] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.08]">
      {rows.map(([trigger, effect], i) => (
        <div
          key={trigger}
          className={`grid grid-cols-1 gap-1.5 px-5 py-4 transition-colors hover:bg-white/[0.02] sm:grid-cols-[320px_1fr] ${
            i ? 'border-t border-white/[0.08]' : ''
          }`}
        >
          <code className="text-[13px] text-[rgb(var(--syn-keyword))]">{trigger}</code>
          <span className="text-sm leading-relaxed text-muted">{effect}</span>
        </div>
      ))}
    </div>
  );
}

/** Hairline card grid — the project's standard multi-item layout. */
export function Cards({ items, cols = 3 }: { items: { t: string; d: string }[]; cols?: 2 | 3 | 4 }) {
  const grid = cols === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : cols === 2 ? 'md:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3';
  return (
    <div className={`grid gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.06] ${grid}`}>
      {items.map((it) => (
        <div key={it.t} className="bg-[rgb(11_11_14)] p-6">
          <h3 className="text-[15px] font-semibold">{it.t}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">{it.d}</p>
        </div>
      ))}
    </div>
  );
}

/** Numbered walkthrough, mirroring the landing page's Steps rhythm. */
export function Walkthrough({ steps }: { steps: [string, string][] }) {
  return (
    <div>
      {steps.map(([t, d], i) => (
        <div key={t} className={`py-5 ${i ? 'row-line' : ''}`}>
          <div className="flex items-baseline gap-4">
            <span className="text-xs tabular-nums text-muted">({String(i + 1).padStart(2, '0')})</span>
            <div>
              <h4 className="text-[15px] font-semibold">{t}</h4>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">{d}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * A simulated GitHub comment — shows what Forge actually posts, so a reader can
 * judge the output without installing anything.
 */
export function CommentPreview({
  verdict, tone = 'neutral', children,
}: {
  verdict: string;
  tone?: 'neutral' | 'danger' | 'good';
  children: ReactNode;
}) {
  const toneClass =
    tone === 'danger' ? 'text-rose-300/90' : tone === 'good' ? 'text-emerald-300/90' : 'text-muted';
  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center gap-2 border-b border-white/[0.08] px-5 py-3 text-sm">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/5">🔨</span>
        <span className="font-semibold">shipit-forge</span>
        <span className="rounded-full border border-white/15 px-1.5 text-[10px] text-muted">bot</span>
        <span className={`ml-auto text-xs ${toneClass}`}>{verdict}</span>
      </div>
      <div className="space-y-3 p-5 text-sm leading-relaxed">{children}</div>
    </div>
  );
}

/** A red/green suggestion pair, as GitHub renders it. */
export function DiffPair({ before, after }: { before: string; after: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-white/10 font-mono text-[12.5px]">
      <div className="bg-rose-400/10 px-3 py-1.5 text-rose-200">- {before}</div>
      <div className="bg-emerald-400/10 px-3 py-1.5 text-emerald-200">+ {after}</div>
    </div>
  );
}
