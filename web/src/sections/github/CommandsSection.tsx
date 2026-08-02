import { Terminal } from 'lucide-react';
import { Section } from '../../components/GuideBits';

const COMMANDS: [string, string][] = [
  ['label agent-fix / open issue', 'Posts a detailed analysis — root cause and the proposed fix.'],
  ['/fix', 'Implements the fix, adds tests, runs them, opens a PR.'],
  ['open a PR (automatic)', 'Code + security review with inline suggestions.'],
  ['/review', 'One review now, without subscribing to future pushes.'],
  ['/review always', 'Reviews now and on every later push to this PR.'],
  ['/security', 'Security-only review of the current PR.'],
  ['/audit', 'Full-repository security scan, plus live Dependabot CVEs.'],
  ['/run <routine>', 'Start a saved routine on demand.'],
  ['/code-review · /triage · /document', 'Run a named skill instead of a free-form answer.'],
  ['@shipit-forge <ask>', 'Answer in the thread, or push a follow-up commit on a PR.'],
];

export function CommandsSection() {
  return (
    <Section
      id="commands"
      Icon={Terminal}
      eyebrow="Reference"
      title="Every command, in one table"
      lead="Comment these in any issue or pull request. Commands work regardless of the repository's configured cadence, so you can always ask for something on demand."
    >
      <div className="overflow-hidden rounded-xl border border-white/[0.08]">
        {COMMANDS.map(([t, d], i) => (
          <div
            key={t}
            className={`grid grid-cols-1 gap-1.5 px-5 py-3.5 transition-colors hover:bg-white/[0.02] sm:grid-cols-[320px_1fr] ${
              i ? 'border-t border-white/[0.08]' : ''
            }`}
          >
            <code className="text-[13px] text-[rgb(var(--syn-keyword))]">{t}</code>
            <span className="text-sm leading-relaxed text-muted">{d}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}
