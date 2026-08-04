import { Network } from 'lucide-react';
import { Section } from '../../components/GuideBits';

/**
 * The whole system on one page.
 *
 * Placed first because everything after it is a detail of something here — and
 * because the two questions people actually arrive with are "where does my code
 * go" and "what runs before the model gets it".
 */
export function ArchitectureSection() {
  return (
    <Section
      id="architecture"
      Icon={Network}
      eyebrow="Overview"
      title="The whole thing, on one page"
      lead="A GitHub event is cloned into a sandbox. Deterministic scanners run first and cost nothing. The agent loop reasons and calls sandboxed tools, told what the scan already found so it spends its turns on what is reachable. Tests verify. Everything is merged and deduplicated into one review."
    >
      <figure className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white">
        <img
          src={`${import.meta.env.BASE_URL}architecture.png`}
          alt="End-to-end workflow: issue or pull-request event, Probot webhook, clone repository into a sandbox, run the deterministic scanners with no model call, then the agent loop with its provider layer and sandboxed tools, verify with tests, and merge and deduplicate the findings. Outputs are an opened or updated pull request, an inline pull-request review, and mention replies."
          className="w-full"
          loading="lazy"
        />
      </figure>
      <p className="mt-4 text-sm leading-relaxed text-muted">
        The scanners run <em>before</em> the model on purpose. A review that stops early — an iteration limit, a
        spend cap, a provider outage — still carries the findings that were free, because they were gathered
        before anything could fail.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        One box is missing from the drawing: a third scanner reads the source itself — command injection, path
        traversal, a credential written to a log, unsafe deserialization — alongside the two shown. Said here
        rather than left for the next redraw, because a diagram that quietly under-claims is still a diagram
        that does not match the code.
      </p>
    </Section>
  );
}
