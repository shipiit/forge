import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CalendarClock, Zap, Target, Wrench, ListChecks, ShieldCheck } from 'lucide-react';
import { Header, Footer } from '../components/Layout';
import { ScrollProgress } from '../components/ScrollProgress';
import { Code } from '../components/Code';
import { Tabs } from '../components/Tabs';
import { Section, Cards, Walkthrough, CommentPreview, rise } from '../components/GuideBits';
import { useActiveSection } from '../components/useActiveSection';

const TOC: [string, string][] = [
  ['triggers', 'Three trigger types'],
  ['setup', 'Set one up'],
  ['cron', 'Cron reference'],
  ['recipes', 'Recipes'],
  ['write', 'Routines that edit'],
  ['ops', 'Cost & safety'],
];
const TOC_IDS = TOC.map(([id]) => id);

const RECIPES = [
  {
    id: 'digest',
    label: 'Nightly digest',
    hint: 'Every weekday morning, a summary of what merged while you were asleep.',
    yaml: `routines:
  - name: nightly-digest
    skill: commit-summary
    prompt: |
      Summarize every pull request merged in the last 24 hours.
      Group by area. Call out anything that changes behaviour
      for a consumer of this code.
    schedule: "0 9 * * 1-5"   # 09:00, weekdays
    manual: true`,
  },
  {
    id: 'docs',
    label: 'Docs drift',
    hint: 'Weekly sweep for documentation that no longer matches the code. Opens a PR with the corrections.',
    yaml: `routines:
  - name: docs-drift
    skill: document
    prompt: |
      Find documentation that no longer matches the code and
      correct it. Verify each statement against the source
      before changing it — do not guess.
    schedule: "0 3 * * 1"     # 03:00 Mondays
    write: true               # may edit files → opens a PR
    tools: [read_file, search, glob, write_file, edit_file]`,
  },
  {
    id: 'security',
    label: 'Weekly security sweep',
    hint: 'A standing audit of the whole repository, independent of any PR.',
    yaml: `routines:
  - name: weekly-audit
    skill: security-audit
    prompt: |
      Audit the repository. Report only findings where you can
      name the source, the sink, and the path between them.
    schedule: "0 6 * * 1"     # 06:00 Mondays
    manual: true`,
  },
  {
    id: 'backlog',
    label: 'Backlog triage',
    hint: 'Diagnose newly opened issues on a schedule instead of one at a time.',
    yaml: `routines:
  - name: triage-backlog
    skill: triage
    prompt: |
      For each issue opened since the last run, identify the
      root cause and the files that would need to change.
    schedule: "0 8 * * *"
    events: [issues.opened]   # and immediately on each new issue`,
  },
];

export function Schedules() {
  const active = useActiveSection(TOC_IDS);

  return (
    <>
      <ScrollProgress />
      <Header />

      <div className="mx-auto grid max-w-[1500px] grid-cols-1 gap-14 px-7 pt-14 lg:grid-cols-[200px_minmax(0,1fr)]">
        <aside className="sticky top-24 hidden self-start lg:block">
          <nav aria-label="On this page" className="relative border-l border-white/[0.08]">
            {TOC.map(([id, label]) => {
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
            <span className="eyebrow">Routines</span>
            <h1 className="display mt-6 text-[clamp(40px,6vw,68px)]">
              Work that happens<br /><span className="dim">without you.</span>
            </h1>
            <p className="mt-6 max-w-3xl text-[15px] leading-relaxed text-muted">
              A routine is a saved configuration — a skill, extra instructions, a tool allowlist — plus the triggers
              that start it. Nightly digests, weekly documentation sweeps, standing security audits, backlog triage.
              One routine can carry a schedule, an on-demand command, and repository events all at once.
            </p>
          </motion.div>

          <Section
            id="triggers" Icon={CalendarClock} eyebrow="How they start"
            title="Three trigger types, freely combined"
            lead="Attach any combination to the same routine. A digest can run nightly, be fired on demand before a standup, and also run on every merge — without defining it three times."
          >
            <div className="grid gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.06] md:grid-cols-3">
              {[
                { I: CalendarClock, t: 'Scheduled', d: 'A cron on your own workflow. GitHub already has a scheduler, so runs stay inside your CI on your credentials.', ex: 'schedule: "0 9 * * *"' },
                { I: Zap, t: 'On demand', d: 'Comment /run <name> in any issue or PR thread, or press "Run workflow" in the Actions tab.', ex: '/run nightly-digest' },
                { I: Target, t: 'Event-driven', d: 'React to repository activity — on merge, on release, on a labelled PR — narrowed by the full filter set.', ex: 'events: [pull_request.closed]' },
              ].map((e) => (
                <div key={e.t} className="bg-[rgb(11_11_14)] p-7">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5"><e.I size={18} /></span>
                  <h3 className="mt-5 text-lg font-semibold">{e.t}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{e.d}</p>
                  <code className="mt-4 inline-block rounded-full border border-white/10 px-2.5 py-0.5 text-[11px] text-[rgb(var(--syn-keyword))]">{e.ex}</code>
                </div>
              ))}
            </div>
            <p className="mt-6 max-w-3xl text-sm leading-relaxed text-muted">
              There is no Forge-operated scheduler holding a token for your repository. Scheduled runs are your own
              workflow calling the Action — the same credentials, the same audit trail, the same permissions as
              everything else in your CI.
            </p>
          </Section>

          <Section
            id="setup" Icon={Wrench} eyebrow="Setup"
            title="Three steps to a running routine"
            lead="Define it in your repository, point a workflow schedule at it, and it runs. Everything is version-controlled and reviewed like any other change."
          >
            <Tabs
              ariaLabel="Routine setup"
              tabs={[
                {
                  id: 'define',
                  label: '1 · Define it',
                  hint: 'Routines live in .github/agent.yml, so a change to one goes through review like code.',
                  content: (
                    <div className="grid gap-6 lg:grid-cols-2">
                      <Code label=".github/agent.yml" lang="yaml" code={`routines:
  - name: nightly-digest
    description: What merged yesterday
    skill: commit-summary          # a built-in or your own
    prompt: |
      Summarize every PR merged in the last 24 hours.
      Group by area; call out behaviour changes.
    schedule: "0 9 * * *"          # 09:00 daily
    manual: true                   # /run nightly-digest
    events: [pull_request.closed]  # and on each merge
    tools: [read_file, search, glob]
    filters:
      - { field: base_branch, operator: equals, value: main }`} />
                      <div className="overflow-hidden rounded-xl border border-white/[0.08]">
                        {[
                          ['name', 'Required. Lowercase, used by /run.'],
                          ['skill', 'Which prompt pack to run. Built-in or committed.'],
                          ['prompt', 'Extra instructions for this routine.'],
                          ['schedule', 'Cron expression. Fired by your workflow.'],
                          ['manual', 'Allow /run. Defaults to true.'],
                          ['events', 'Repository events that start it.'],
                          ['filters', 'Conditions the event must satisfy.'],
                          ['tools', 'Tool allowlist — fewer tools, fewer tokens.'],
                          ['write', 'Allow file edits. Defaults to false.'],
                        ].map(([k, d], i) => (
                          <div key={k} className={`grid grid-cols-1 gap-1 px-5 py-3 sm:grid-cols-[130px_1fr] ${i ? 'border-t border-white/[0.08]' : ''}`}>
                            <code className="text-[13px] text-[rgb(var(--syn-keyword))]">{k}</code>
                            <span className="text-sm text-muted">{d}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ),
                },
                {
                  id: 'workflow',
                  label: '2 · Add the schedule',
                  hint: 'One workflow can drive every scheduled routine. workflow_dispatch adds a "Run workflow" button for firing it by hand.',
                  content: (
                    <Code label=".github/workflows/forge-routines.yml" lang="yaml" code={`name: Forge routines

on:
  schedule:
    - cron: '0 9 * * *'       # nightly digest
    - cron: '0 3 * * 1'       # Monday docs sweep
  workflow_dispatch:           # manual "Run workflow" button

permissions:
  contents: write
  pull-requests: write
  issues: write

jobs:
  routines:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: shipiit/forge@v1
        with:
          skill: commit-summary
          allowed-tools: read_file search glob   # fewer tokens
          max-turns: "10"
          anthropic-api-key: \${{ secrets.ANTHROPIC_API_KEY }}`} />
                  ),
                },
                {
                  id: 'run',
                  label: '3 · Run it',
                  hint: 'The same routine, started three different ways.',
                  content: (
                    <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
                      <div>
                        <Code label="from a GitHub comment" lang="bash" code={`/run nightly-digest

# with an extra instruction just for this run:
/run docs-drift only the API reference`} />
                        <Code label="from your machine" lang="bash" code={`forge skills                    # see what is available
forge run --repo . --skill commit-summary --task "summarize this week"
forge run --repo . --skill document --write`} />
                      </div>
                      <CommentPreview verdict="routine complete" tone="good">
                        <div className="font-semibold">🤖 routine <code className="text-[rgb(var(--syn-fn))]">nightly-digest</code></div>
                        <p className="text-muted"><span className="text-text">7 pull requests merged.</span></p>
                        <p className="text-muted">
                          <span className="text-text">API</span> — response caching (#128), tenant scoping on the
                          pricing query (#131).<br />
                          <span className="text-text">Docs</span> — provider setup rewritten (#129).
                        </p>
                        <p className="text-muted">⚠️ #131 changes a default: queries are now tenant-scoped by default.</p>
                        <div className="text-[11px] text-muted">🧮 41,200 in + 980 out · 33,000 cached (saved ~$0.09)</div>
                      </CommentPreview>
                    </div>
                  ),
                },
              ]}
            />
          </Section>

          <Section
            id="cron" Icon={ListChecks} eyebrow="Reference"
            title="Cron expressions"
            lead="Standard five-field cron, in UTC. GitHub's scheduler is best-effort under load, so treat the time as approximate — a digest may arrive a few minutes late, which never matters for this kind of work."
          >
            <div className="grid gap-6 lg:grid-cols-2">
              <Code label="common schedules" lang="bash" code={`'0 9 * * *'      # 09:00 every day
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
#  * * * * *`} />
              <div>
                <Cards cols={2} items={[
                  { t: 'Times are UTC', d: 'GitHub runs cron in UTC with no timezone option. Offset the hour yourself for a local-time digest.' },
                  { t: 'Minimum one hour', d: 'Anything more frequent is rejected. Routines are for standing work, not polling.' },
                  { t: 'Best effort', d: 'Runs can be delayed during peak load, and scheduled workflows pause on repositories with no activity for 60 days.' },
                  { t: 'Default branch only', d: 'Scheduled workflows run from the default branch — a routine on a feature branch will not fire until it merges.' },
                ]} />
              </div>
            </div>
          </Section>

          <Section
            id="recipes" Icon={Zap} eyebrow="Recipes"
            title="Four routines worth having"
            lead="Each one is complete — copy it into .github/agent.yml, point a cron at it, and it runs."
          >
            <Tabs
              ariaLabel="Routine recipes"
              tabs={RECIPES.map((r) => ({
                id: r.id,
                label: r.label,
                hint: r.hint,
                content: <Code label=".github/agent.yml" lang="yaml" code={r.yaml} />,
              }))}
            />
          </Section>

          <Section
            id="write" Icon={Wrench} eyebrow="Write access"
            title="Routines that change code"
            lead="A routine is read-only unless you say otherwise. Set write: true and it may edit files — but the result always arrives as a pull request on its own branch, never a push to your default branch."
          >
            <div className="grid gap-6 lg:grid-cols-2">
              <Code label=".github/agent.yml" lang="yaml" code={`routines:
  - name: docs-drift
    skill: document
    schedule: "0 3 * * 1"
    write: true               # ← unlocks the edit tools
    tools:
      - read_file
      - search
      - glob
      - write_file
      - edit_file`} />
              <div>
                <Walkthrough steps={[
                  ['It works on a branch', 'Every write routine checks out forge/routine-<name> before touching anything.'],
                  ['Nothing to commit is fine', 'If the routine finds no change worth making, it says so and exits — no empty PR.'],
                  ['You review it', 'The pull request carries the summary and the run cost. Merge it, or close it.'],
                  ['Edits are scanned', 'Every write is checked against the security pattern rules first, at no token cost.'],
                ]} />
              </div>
            </div>
          </Section>

          <Section
            id="ops" Icon={ShieldCheck} eyebrow="Operations"
            title="Keeping it cheap and safe"
            lead="A routine runs unattended, so the guardrails matter more than they do in an interactive flow."
          >
            <Cards items={[
              { t: 'Narrow the tools', d: 'A read-only digest needs read_file, search, and glob. Every other schema is resent on every turn for nothing.' },
              { t: 'Bound the loop', d: 'max-turns caps the iterations. A routine that cannot finish in ten turns usually needs a sharper prompt, not more turns.' },
              { t: 'Caching does the rest', d: 'The system prompt, tool schemas, and transcript are all cached — a repeated nightly run is mostly cache reads.' },
              { t: 'One at a time', d: 'A lock keeps duplicate triggers from starting the same routine twice, so a redelivered webhook is a no-op.' },
              { t: 'Read-only by default', d: 'write: true is opt-in per routine, and even then the output is a PR you approve.' },
              { t: 'Cost on every run', d: 'Each routine comment carries its token and spend footer, so a runaway schedule is visible immediately.' },
            ]} />
          </Section>

          <motion.div {...rise} className="flex flex-wrap gap-4 border-t border-white/[0.07] pt-12">
            <Link to="/docs#schedule" className="btn btn-white !rounded-none !uppercase !tracking-[0.14em]">Setup guide</Link>
            <Link to="/github#routines" className="btn btn-line !rounded-none !uppercase !tracking-[0.14em]">All GitHub triggers</Link>
          </motion.div>
        </main>
      </div>

      <Footer />
    </>
  );
}
