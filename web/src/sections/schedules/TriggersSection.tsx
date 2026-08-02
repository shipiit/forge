import { CalendarClock, Zap, Target } from 'lucide-react';
import { Section } from '../../components/GuideBits';

const TRIGGERS = [
  {
    I: CalendarClock,
    t: 'Scheduled',
    d: 'A cron on your own workflow. GitHub already has a scheduler, so runs stay inside your CI on your credentials.',
    ex: 'schedule: "0 9 * * *"',
  },
  {
    I: Zap,
    t: 'On demand',
    d: 'Comment /run <name> in any issue or PR thread, or press "Run workflow" in the Actions tab.',
    ex: '/run nightly-digest',
  },
  {
    I: Target,
    t: 'Event-driven',
    d: 'React to repository activity — on merge, on release, on a labelled PR — narrowed by the full filter set.',
    ex: 'events: [pull_request.closed]',
  },
];

export function TriggersSection() {
  return (
    <Section
      id="triggers"
      Icon={CalendarClock}
      eyebrow="How they start"
      title="Three trigger types, freely combined"
      lead="Attach any combination to the same routine. A digest can run nightly, be fired on demand before a standup, and also run on every merge — without defining it three times."
    >
      <div className="grid gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.06] md:grid-cols-3">
        {TRIGGERS.map((e) => (
          <div key={e.t} className="bg-[rgb(11_11_14)] p-7">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5">
              <e.I size={18} />
            </span>
            <h3 className="mt-5 text-lg font-semibold">{e.t}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{e.d}</p>
            <code className="mt-4 inline-block rounded-full border border-white/10 px-2.5 py-0.5 text-[11px] text-[rgb(var(--syn-keyword))]">
              {e.ex}
            </code>
          </div>
        ))}
      </div>
      <p className="mt-6 max-w-3xl text-sm leading-relaxed text-muted">
        There is no Forge-operated scheduler holding a token for your repository. Scheduled runs are your own
        workflow calling the Action — the same credentials, the same audit trail, the same permissions as
        everything else in your CI.
      </p>
    </Section>
  );
}
