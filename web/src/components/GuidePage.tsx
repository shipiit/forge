import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Header, Footer } from './Layout';
import { ScrollProgress } from './ScrollProgress';
import { useActiveSection } from './useActiveSection';
import { rise } from './GuideBits';

export type Toc = [id: string, label: string][];

/**
 * The shell every long-form page shares: sticky scrollspy sidebar, wide content
 * column, header and footer. Kept in one place so the three guide pages cannot
 * drift apart visually.
 */
export function GuidePage({
  toc,
  eyebrow,
  title,
  subtitle,
  lead,
  intro,
  children,
}: {
  toc: Toc;
  eyebrow: string;
  /** First line of the display headline. */
  title: string;
  /** Second, dimmed line. */
  subtitle: string;
  lead: string;
  /** Optional content directly under the lead (a code block, usually). */
  intro?: ReactNode;
  children: ReactNode;
}) {
  const active = useActiveSection(toc.map(([id]) => id));

  return (
    <>
      <ScrollProgress />
      <Header />

      <div className="mx-auto grid max-w-[1500px] grid-cols-1 gap-14 px-7 pt-14 lg:grid-cols-[200px_minmax(0,1fr)]">
        <aside className="sticky top-24 hidden self-start lg:block">
          <nav aria-label="On this page" className="relative border-l border-white/[0.08]">
            {toc.map(([id, label]) => {
              const isActive = id === active;
              return (
                <a
                  key={id}
                  href={`#${id}`}
                  aria-current={isActive ? 'true' : undefined}
                  className={`relative block py-1.5 pl-4 text-sm transition-colors duration-200 motion-reduce:transition-none ${
                    isActive ? 'font-medium text-text' : 'text-muted hover:text-text'
                  }`}
                >
                  <span
                    aria-hidden
                    className={`absolute -left-px top-0 h-full w-px transition-colors duration-200 ${
                      isActive ? 'bg-[rgb(var(--syn-keyword))]' : 'bg-transparent'
                    }`}
                  />
                  {label}
                </a>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 space-y-16 pb-20">
          <motion.div {...rise}>
            <span className="eyebrow">{eyebrow}</span>
            <h1 className="display mt-6 text-[clamp(40px,6vw,68px)]">
              {title}
              <br />
              <span className="dim">{subtitle}</span>
            </h1>
            <p className="mt-6 max-w-3xl text-[15px] leading-relaxed text-muted">{lead}</p>
            {intro}
          </motion.div>

          {children}
        </main>
      </div>

      <Footer />
    </>
  );
}
