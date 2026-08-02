import { RefreshCw } from 'lucide-react';
import { Section, Triggers } from '../../components/GuideBits';

export function CiSection() {
  return (
    <Section
      id="ci"
      Icon={RefreshCw}
      eyebrow="Continuous integration"
      title="Fix its own red builds"
      lead="When CI fails on a branch Forge opened, it reads the failing checks and logs, corrects the code, re-runs the suite, and pushes a ci-fix commit."
    >
      <Triggers
        rows={[
          ['check_suite / workflow_run failed', 'Only on forge/* branches, and only twice — then it stops for a human.'],
        ]}
      />
      <p className="mt-6 max-w-3xl text-sm leading-relaxed text-muted">
        The two-attempt bound is deliberate: an unbounded self-correcting loop is exactly how an agent quietly
        spends a fortune overnight. It also only ever touches branches it opened itself, so it can never rewrite
        someone else's work.
      </p>
    </Section>
  );
}
