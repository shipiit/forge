import { ShieldCheck } from 'lucide-react';
import { Section, Cards } from '../../components/GuideBits';

const GUARDRAILS = [
  { t: 'Narrow the tools', d: 'A read-only digest needs read_file, search, and glob. Every other schema is resent on every turn for nothing.' },
  { t: 'Bound the loop', d: 'max-turns caps the iterations. A routine that cannot finish in ten turns usually needs a sharper prompt, not more turns.' },
  { t: 'Caching does the rest', d: 'The system prompt, tool schemas, and transcript are all cached — a repeated nightly run is mostly cache reads.' },
  { t: 'One at a time', d: 'A lock keeps duplicate triggers from starting the same routine twice, so a redelivered webhook is a no-op.' },
  { t: 'Read-only by default', d: 'write: true is opt-in per routine, and even then the output is a pull request you approve.' },
  { t: 'Cost on every run', d: 'Each routine comment carries its token and spend footer, so a runaway schedule is visible immediately.' },
];

export function OpsSection() {
  return (
    <Section
      id="ops"
      Icon={ShieldCheck}
      eyebrow="Operations"
      title="Keeping it cheap and safe"
      lead="A routine runs unattended, so the guardrails matter more than they do in an interactive flow."
    >
      <Cards items={GUARDRAILS} />
    </Section>
  );
}
