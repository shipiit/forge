import { Rocket } from 'lucide-react';
import { Code } from '../../components/Code';
import { Tabs } from '../../components/Tabs';
import { Section } from '../../components/GuideBits';
import { ProviderSetup } from '../../components/ProviderSetup';

export function QuickstartSection() {
  return (
    <Section
      id="quickstart"
      Icon={Rocket}
      eyebrow="Quick start"
      title="Try it before you install anything"
      lead="The engine runs locally with a built-in fake provider — no keys, no account, about two minutes. Once you like what it does, the same credentials work everywhere: CLI, Action secrets, and the hosted App."
    >
      <Tabs
        ariaLabel="Quick start"
        tabs={[
          {
            id: 'local',
            label: 'Run it locally',
            hint: 'No credentials at all — the fake provider replays a scripted run so you can see the loop end to end.',
            content: (
              <Code
                label="bash"
                lang="bash"
                code={`git clone https://github.com/shipiit/forge.git && cd forge
npm install && npm run build && npm test

node dist/cli.js fix --repo /path/to/repo \\
  --task "fix the failing login test" --provider fake`}
              />
            ),
          },
          {
            id: 'key',
            label: 'Add a real key',
            hint: 'The wizard writes a gitignored .env at chmod 600 — your key never lands in the repository.',
            content: (
              <div>
                <Code
                  label="forge setup"
                  lang="bash"
                  code={`node dist/cli.js setup    # pick a provider, paste your key
node dist/cli.js doctor   # confirm what is configured

# then run it for real:
node dist/cli.js fix --repo . --task "…" --provider anthropic`}
                />
                <div className="mt-4">
                  <ProviderSetup />
                </div>
              </div>
            ),
          },
          {
            id: 'cli',
            label: 'Every CLI command',
            hint: 'The same engine the Action and App run, driven from your terminal.',
            content: (
              <Code
                label="bash"
                lang="bash"
                code={`forge setup                    # configure a provider, write .env
forge doctor                   # what is configured, and what is missing
forge skills                   # list built-in and repo skills

forge fix --repo . --task "…"  # investigate, edit, test, show the diff
forge run --repo . --skill code-review --task "check the auth path"
forge run --repo . --skill document --write   # allow edits`}
              />
            ),
          },
        ]}
      />
    </Section>
  );
}
