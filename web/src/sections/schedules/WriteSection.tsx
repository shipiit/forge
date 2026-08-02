import { Wrench } from 'lucide-react';
import { Code } from '../../components/Code';
import { Section, Walkthrough } from '../../components/GuideBits';

export function WriteSection() {
  return (
    <Section
      id="write"
      Icon={Wrench}
      eyebrow="Write access"
      title="Routines that change code"
      lead="A routine is read-only unless you say otherwise. Set write: true and it may edit files — but the result always arrives as a pull request on its own branch, never a push to your default branch."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Code
          label=".github/agent.yml"
          lang="yaml"
          code={`routines:
  - name: docs-drift
    skill: document
    schedule: "0 3 * * 1"
    write: true               # ← unlocks the edit tools
    tools:
      - read_file
      - search
      - glob
      - write_file
      - edit_file`}
        />
        <Walkthrough
          steps={[
            ['It works on a branch', 'Every write routine checks out forge/routine-<name> before touching anything.'],
            ['Nothing to commit is fine', 'If the routine finds no change worth making, it says so and exits — no empty PR.'],
            ['You review it', 'The pull request carries the summary and the run cost. Merge it, or close it.'],
            ['Edits are scanned', 'Every write is checked against the security pattern rules first, at no token cost.'],
          ]}
        />
      </div>
    </Section>
  );
}
