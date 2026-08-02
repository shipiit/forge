import { Server } from 'lucide-react';
import { Code } from '../../components/Code';
import { Section } from '../../components/GuideBits';

export function GhesSection() {
  return (
    <Section
      id="ghes"
      Icon={Server}
      eyebrow="Self-hosted"
      title="GitHub Enterprise Server"
      lead="Everything works against a self-managed GitHub instance. Only two things differ — the API base URL and the clone host — and both are resolved from the environment, so no other configuration changes."
    >
      <Code
        label="environment"
        lang="bash"
        code={`GHES_HOSTNAME=github.example.com

# On GHES Actions runners this is set for you, and takes precedence:
GITHUB_API_URL=https://github.example.com/api/v3`}
      />
    </Section>
  );
}
