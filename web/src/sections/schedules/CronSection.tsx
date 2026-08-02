import { ListChecks } from 'lucide-react';
import { Code } from '../../components/Code';
import { Section, Cards } from '../../components/GuideBits';

const CAVEATS = [
  { t: 'Times are UTC', d: 'GitHub runs cron in UTC with no timezone option. Offset the hour yourself for a local-time digest.' },
  { t: 'Minimum one hour', d: 'Anything more frequent is rejected. Routines are for standing work, not polling.' },
  { t: 'Best effort', d: 'Runs can be delayed during peak load, and scheduled workflows pause on repositories with no activity for 60 days.' },
  { t: 'Default branch only', d: 'Scheduled workflows run from the default branch — a routine on a feature branch will not fire until it merges.' },
];

export function CronSection() {
  return (
    <Section
      id="cron"
      Icon={ListChecks}
      eyebrow="Reference"
      title="Cron expressions"
      lead="Standard five-field cron, in UTC. GitHub's scheduler is best-effort under load, so treat the time as approximate — a digest arriving a few minutes late never matters for this kind of work."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Code
          label="common schedules"
          lang="bash"
          code={`'0 9 * * *'      # 09:00 every day
'0 9 * * 1-5'    # 09:00 on weekdays
'0 3 * * 1'      # 03:00 every Monday
'0 */6 * * *'    # every six hours
'0 0 1 * *'      # midnight on the 1st of the month
'30 22 * * 5'    # 22:30 every Friday

#  ┌── minute (0-59)
#  │ ┌── hour (0-23, UTC)
#  │ │ ┌── day of month (1-31)
#  │ │ │ ┌── month (1-12)
#  │ │ │ │ ┌── day of week (0-6, Sunday = 0)
#  * * * * *`}
        />
        <Cards cols={2} items={CAVEATS} />
      </div>
    </Section>
  );
}
