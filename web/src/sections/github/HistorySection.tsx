import { History } from 'lucide-react';
import { Code } from '../../components/Code';
import { Section, Cards } from '../../components/GuideBits';

export function HistorySection() {
  return (
    <Section
      id="history"
      Icon={History}
      eyebrow="Documentation"
      title="A documented history of every change"
      lead="When a PR merges or a commit lands on your default branch, Forge writes one entry describing what changed and why — from that change's diff alone, never a summary of the whole repository. The entry arrives as a pull request you approve."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <Code
            label=".github/agent.yml"
            lang="yaml"
            code={`history: true
history_path: docs/CHANGE-HISTORY.md`}
          />
          <div className="mt-4">
            <Cards
              cols={2}
              items={[
                { t: 'Scoped to one change', d: 'The agent gets that diff and is told to describe only it — entries stay specific and stay true.' },
                { t: 'Never a direct push', d: 'Opens as a PR on a forge/history-* branch. Your default branch stays protected.' },
                { t: 'Risk and impact', d: 'Records the areas touched, a risk level, and any behaviour a consumer would notice.' },
                { t: 'Idempotent', d: 'A redelivered webhook is a no-op — an already-recorded change is detected and skipped.' },
              ]}
            />
          </div>
        </div>
        <Code
          label="docs/CHANGE-HISTORY.md"
          lang="markdown"
          code={`# Change history

## 2026-08-02 — Add response caching (#128)

**Author:** octocat · **Risk:** 🟡 medium · **Areas:** \`src/cache\`

Responses from the pricing endpoint are now cached for 60s,
cutting p99 latency roughly in half under load. The cache is
keyed on tenant, so no cross-tenant reads are possible.

**Notable behaviour changes**
- Default TTL is 60s; set CACHE_TTL=0 to disable.
- Stale reads are possible for up to one TTL after a write.

## 2026-08-01 — Fix add() sign error (#127)

**Author:** dependabot · **Risk:** 🟢 low · **Areas:** \`src/math\``}
        />
      </div>
    </Section>
  );
}
