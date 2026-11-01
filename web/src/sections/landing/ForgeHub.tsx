import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { HubDiagram } from './hub/HubDiagram';
import { HubTabs } from './hub/HubTabs';
import { HUB_TABS } from './lib/hub';
import { rise } from './motion';

export function ForgeHub() {
  const [active, setActive] = useState(0);
  const tab = HUB_TABS[active]!;

  return (
    <section id="hub" className="relative border-t border-white/[0.07] px-7 py-24">
      <div className="mx-auto max-w-7xl">
        <motion.div {...rise}>
          <span className="eyebrow eyebrow-ember">Everything a review touches</span>
          <h2 className="display mt-6 text-[clamp(34px,5vw,60px)]">
            It reads what a senior
            <br />
            <span className="dim">reviewer would.</span>
          </h2>
          <p className="mt-5 max-w-2xl text-muted">
            The whole file, not just the hunk. The callers. Your rules — from the branch it merges into. What the
            scanners already found. Then it posts where your team already works.
          </p>
        </motion.div>
        <motion.div {...rise} className="mt-12">
          <HubTabs tabs={HUB_TABS} active={active} onChange={setActive} idPrefix="hub" />
          <div id="hub-panel" role="tabpanel" aria-labelledby={`hub-tab-${tab.id}`} className="mt-10">
            <AnimatePresence mode="wait">
              <motion.div key={tab.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
                <HubDiagram tab={tab} />
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
