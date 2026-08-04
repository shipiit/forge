import { Compass } from 'lucide-react';
import { Section, Triggers, CommentPreview } from '../../components/GuideBits';

export function HelpSection() {
  return (
    <Section
      id="help"
      Icon={Compass}
      eyebrow="Onboarding"
      title='Ask "how do I…?" and get steps, not a guess'
      lead="Comment /help with a question in any issue or pull request. It reads this repository — the scripts, the config, the defaults — and answers with the steps for this project, not the ones that are usually true of projects like it."
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_460px]">
        <div>
          <Triggers
            rows={[
              ['/help how do I add a new provider?', 'Finds the adapter, the registry and the env vars, then walks you through it.'],
              ['/help how do I run this locally?', 'Reads package.json and the README rather than assuming npm start.'],
              ['/help', 'For someone who does not know what to ask yet — what this is and how to use it.'],
              ['@shipit-forge /help …', 'Same thing, addressed by name. /how and /how-to work too.'],
            ]}
          />

          <h3 className="mt-8 text-sm font-semibold text-text">What comes back</h3>
          <ol className="mt-3 space-y-2 text-sm leading-relaxed text-muted">
            <li>
              <span className="text-text">1. What you are actually trying to do</span> — one sentence, so you can stop
              reading if it misunderstood.
            </li>
            <li>
              <span className="text-text">2. Numbered steps</span> — the real path, the real key, the real command, with
              before and after when something is edited.
            </li>
            <li>
              <span className="text-text">3. How you know it worked</span> — the output that changes, the log line, the
              thing that appears.
            </li>
            <li>
              <span className="text-text">4. What to watch out for</span> — the default that surprises people, the thing
              that only fails later.
            </li>
            <li>
              <span className="text-text">5. Where to read more</span> — by path, in your repository.
            </li>
          </ol>

          <p className="mt-6 text-sm leading-relaxed text-muted">
            The failure this guards against is not vagueness — it is a{' '}
            <span className="text-text">confident instruction to set a config key that does not exist</span>, which
            sends someone off to debug their own typo. It has to find the thing in the code before it can tell you to
            type it, and it says plainly when what you want is not supported rather than inventing a flag.
          </p>
        </div>

        <CommentPreview verdict="answered" tone="good">
          <p className="text-muted">
            <span className="text-text">@you</span> — /help how do I point this at a different model?
          </p>
          <div className="row-line pt-3 font-semibold">🧭 Setting the model for this repository</div>
          <p className="text-muted">
            You want Forge to use a different model than the provider default.
          </p>
          <ol className="space-y-1.5 text-muted">
            <li>
              <span className="text-text">1.</span> Add <code className="text-[rgb(var(--syn-keyword))]">model:</code> to{' '}
              <code className="text-white/80">.github/agent.yml</code> — it is read at{' '}
              <code className="text-white/80">src/config.ts</code> and wins over the env default.
            </li>
            <li>
              <span className="text-text">2.</span> Use the provider's own id, e.g.{' '}
              <code className="text-[rgb(var(--syn-string))]">gemini-2.5-flash</code>.
            </li>
            <li>
              <span className="text-text">3.</span> Comment <code className="text-[rgb(var(--syn-keyword))]">/review</code>{' '}
              on any PR — the footer under the reply names the model that ran.
            </li>
          </ol>
          <p className="text-muted">
            <span className="text-text">Watch out:</span> the output cap is clamped per model, so a model with a smaller
            ceiling than 16k silently gets its own limit rather than failing.
          </p>
        </CommentPreview>
      </div>
    </Section>
  );
}
