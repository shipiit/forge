import { HelpCircle } from 'lucide-react';
import { Section } from '../../components/GuideBits';

const FAQ: [string, string][] = [
  [
    'Does it burn tokens 24/7?',
    'No. The server idles for free; the model only runs on a real event. Iterations are capped, and the CI auto-fix loop stops after 2 attempts — an unbounded self-correcting loop is exactly how an agent quietly spends a fortune overnight.',
  ],
  [
    'Does it auto-approve or merge PRs?',
    'Never. It only comments or requests changes, and it has no merge permission. The review check run always completes as neutral, so it cannot block a merge through branch protection either. Approval is always a human decision.',
  ],
  [
    'Where does my code go?',
    'Only to the LLM provider you configured — you hold that contract, not us. Repositories are cloned into ephemeral temp directories and deleted after each run; nothing persists between runs. With Ollama nothing leaves the machine at all.',
  ],
  [
    'What does a typical run cost?',
    'A PR review is usually a few cents. Every comment Forge writes carries a footer with the exact tokens used, how many were served from cache, and the estimated spend — so the month-end bill is never a surprise. Prompt caching removes most of the input cost on longer runs.',
  ],
  [
    'How does it avoid reviewing my whole codebase?',
    'A review is scoped to the current change. The agent may read any file to judge whether an issue is real, but a finding about a file the PR never touched is discarded before it is posted — enforced in code, not just asked for in the prompt.',
  ],
  [
    'Can I control what it flags?',
    'Yes. Commit a REVIEW.md and it is injected as the highest-priority instruction block, overriding the defaults: redefine what counts as blocking, cap the nits, skip generated files, add repo-specific checks. FORGE.md sets broader project context used by every flow.',
  ],
  [
    'Can it change code without me noticing?',
    'No. Every change arrives as a pull request on its own branch. The only exception is a follow-up commit to a PR branch, which you asked for by name with an @mention. It never pushes to your default branch.',
  ],
  [
    'What if my provider has an outage?',
    'Set FORGE_FALLBACK_PROVIDERS to a comma-separated chain. Transient failures are retried with backoff; a hard failure moves to the next provider for that call only, so a brief outage never pins the whole run to a weaker model.',
  ],
  [
    'Does it work with self-hosted GitHub?',
    'Yes. Set GHES_HOSTNAME and everything else is identical — only the API base URL and the clone host differ between github.com and Enterprise Server.',
  ],
  [
    'Which model should I use?',
    'Anthropic models support prompt caching and extended thinking, which makes them the cheapest choice for long agent runs despite a higher list price. For review-only workflows a smaller model with a tight allowed-tools list is often enough. Run forge doctor to see what you already have configured.',
  ],
  [
    'Can I stop it reviewing certain PRs?',
    'Use filters in .github/agent.yml — by author, branch, label, or draft state. A common setup is to skip drafts and anything labelled skip-review, and to only review PRs targeting main.',
  ],
  [
    'Is my API key safe in the workflow?',
    'Keys live in GitHub Secrets and are never written to logs — every log path runs through a redactor that strips GitHub tokens, provider keys, PEM blocks, and tokens embedded in clone URLs. forge doctor prints variable names only, never values.',
  ],
];

export function FaqSection() {
  return (
    <Section
      id="faq"
      Icon={HelpCircle}
      eyebrow="Questions"
      title="The things people ask first"
      lead="Cost, safety, and where your code goes — answered plainly."
    >
      <div>
        {FAQ.map(([q, a]) => (
          <details key={q} className="row-line py-1">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-4 font-semibold marker:hidden">
              {q}
              <span className="shrink-0 text-2xl font-light text-muted">+</span>
            </summary>
            <p className="max-w-3xl pb-4 leading-relaxed text-muted">{a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}
