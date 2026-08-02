import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { GuidePage, type Toc } from '../components/GuidePage';
import { rise } from '../components/GuideBits';
import { TriggersSection } from '../sections/schedules/TriggersSection';
import { SetupSection } from '../sections/schedules/SetupSection';
import { EventsSection } from '../sections/schedules/EventsSection';
import { CronSection } from '../sections/schedules/CronSection';
import { RecipesSection } from '../sections/schedules/RecipesSection';
import { WriteSection } from '../sections/schedules/WriteSection';
import { OpsSection } from '../sections/schedules/OpsSection';

const TOC: Toc = [
  ['triggers', 'Three trigger types'],
  ['setup', 'Set one up'],
  ['events', 'Event triggers'],
  ['cron', 'Cron reference'],
  ['recipes', 'Recipes'],
  ['write', 'Routines that edit'],
  ['ops', 'Cost & safety'],
];

export function Schedules() {
  return (
    <GuidePage
      toc={TOC}
      eyebrow="Routines"
      title="Work that happens"
      subtitle="without you."
      lead="A routine is a saved configuration — a skill, extra instructions, a tool allowlist — plus the triggers that start it. Nightly digests, weekly documentation sweeps, standing security audits, backlog triage. One routine can carry a schedule, an on-demand command, and repository events all at once."
    >
      <TriggersSection />
      <SetupSection />
      <EventsSection />
      <CronSection />
      <RecipesSection />
      <WriteSection />
      <OpsSection />

      <motion.div {...rise} className="flex flex-wrap gap-4 border-t border-white/[0.07] pt-12">
        <Link to="/schedules" className="btn btn-white !rounded-none !uppercase !tracking-[0.14em]">
          Setup guide
        </Link>
        <Link to="/github#routines" className="btn btn-line !rounded-none !uppercase !tracking-[0.14em]">
          All GitHub triggers
        </Link>
      </motion.div>
    </GuidePage>
  );
}
