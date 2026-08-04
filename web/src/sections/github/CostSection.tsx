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
      lead="Forge tracks its own spend to the token and works hard to keep the number small. It does not publish it: what a team spends on review — and by inference how much code it ships — is nobody else's business, so the footer is off unless you switch it on."
    >
      <Cards items={LEVERS} />
      <div className="mt-6 max-w-2xl">
        <Code
          label="the footer, when you switch it on with FORGE_SHOW_COST=1"
          lang="text"
          code={`🧮 128,400 in + 6,210 out tokens · 96,000 cached (saved ~$0.29) · ~$0.41 · model claude-sonnet-4-5`}
        />
      </div>
      <Code
        label="tune it per workflow"
        lang="yaml"
        code={`- uses: shipiit/forge@v2
  with:
    allowed-tools: read_file search glob   # smallest useful toolset
    max-turns: "10"                        # bound the loop
    max-output-tokens: "8192"              # smaller budget per turn
    max-nits: "3"                          # shorter reviews
    prompt-cache: "1"                      # on by default
    anthropic-api-key: \${{ secrets.ANTHROPIC_API_KEY }}`}
      />

      <h3 className="mt-10 text-sm font-semibold text-text">Who can see the logs</h3>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
        Every run, turn, tool call and dollar lands in a dashboard — which means it also holds repository
        names, actor logins, pull-request numbers and error strings. Recording is off until you switch it on,
        and nothing is readable without a credential. There are two kinds, because they are for two different
        things.
      </p>
      <div className="mt-4 max-w-2xl overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-white/[0.08] text-xs uppercase tracking-wider text-muted">
              <th className="py-2 pr-4 font-medium">Credential</th>
              <th className="py-2 pr-4 font-medium">For</th>
              <th className="py-2 pr-4 font-medium">Expires</th>
              <th className="py-2 font-medium">Revocable alone</th>
            </tr>
          </thead>
          <tbody className="text-muted">
            <tr className="border-b border-white/[0.05]">
              <td className="py-2.5 pr-4 text-text">Account</td>
              <td className="py-2.5 pr-4">People</td>
              <td className="py-2.5 pr-4">12h idle</td>
              <td className="py-2.5">Yes</td>
            </tr>
            <tr>
              <td className="py-2.5 pr-4 text-text">Shared token</td>
              <td className="py-2.5 pr-4">Scripts, CI</td>
              <td className="py-2.5 pr-4">Never</td>
              <td className="py-2.5">No</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-4 max-w-2xl">
        <Code
          label="one account per person who should see it"
          lang="bash"
          code={`npx forge dashboard:user add rahul
# asks for the password at the terminal, with echo off — never as an
# argument, where it lands in ps, in shell history, and in a CI log

npx forge dashboard:user list             # who can sign in, and when they last did
npx forge dashboard:user password rahul   # also signs out every session it had
npx forge dashboard:user remove rahul`}
        />
      </div>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
        A password is stored only as an scrypt hash with its own salt, and a session only as its SHA-256 — a
        copy of the database cannot be replayed as a login. A wrong password and an unknown account give the
        same answer in the same time, because telling them apart is how somebody enumerates accounts, and
        guessing is throttled per username so one account under attack cannot lock out the rest.
      </p>
    </Section>
  );
}
