import { Gauge } from 'lucide-react';
import { Code } from '../../components/Code';
import { Section, Cards } from '../../components/GuideBits';

const LEVERS = [
  { t: 'Prompt caching', d: 'The system prompt, every tool schema, and the growing transcript are cached — repeated context bills at roughly a tenth of the input rate.' },
  { t: 'Only the tools it needs', d: 'Unused tool schemas are resent on every single turn. An allowlist removes them from the bill entirely.' },
  { t: 'Context compaction', d: 'Stale tool output is elided once a transcript grows large — tuned not to invalidate the cache on every turn.' },
  { t: 'Scoped reviews', d: 'Reviewing only the changed files costs a fraction of reading a whole repository.' },
  { t: 'Bounded loops', d: 'Iterations are capped and CI auto-fix stops after two attempts. Nothing runs away overnight.' },
  { t: 'Your own key', d: 'You bring the provider credentials and pay list price. No markup, because there is no middleman.' },
];

export function CostSection() {
  return (
    <Section
      id="cost"
      Icon={Gauge}
      eyebrow="Economics"
      title="What a run actually costs"
      lead="Forge reports its own spend on every comment and pull request it writes, and works hard to keep that number small."
    >
      <Cards items={LEVERS} />
      <div className="mt-6 max-w-2xl">
        <Code
          label="the footer on every comment Forge writes"
          lang="text"
          code={`🧮 128,400 in + 6,210 out tokens · 96,000 cached (saved ~$0.29) · ~$0.41 · model claude-sonnet-4-5`}
        />
      </div>
      <Code
        label="tune it per workflow"
        lang="yaml"
        code={`- uses: shipiit/forge@v1
  with:
    allowed-tools: read_file search glob   # smallest useful toolset
    max-turns: "10"                        # bound the loop
    max-output-tokens: "8192"              # smaller budget per turn
    max-nits: "3"                          # shorter reviews
    prompt-cache: "1"                      # on by default
    anthropic-api-key: \${{ secrets.ANTHROPIC_API_KEY }}`}
      />
    </Section>
  );
}
