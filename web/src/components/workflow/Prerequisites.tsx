import { KeyRound, ShieldCheck, ToggleRight, Package } from 'lucide-react';
import { Code } from '../Code';

/**
 * What a reader needs in place before the generated file will actually run.
 *
 * Stated up front rather than discovered afterwards: the most common failure is
 * a perfectly valid workflow that does nothing because the secret is missing or
 * Actions is disabled on the repository.
 */

const STEPS = [
  {
    Icon: Package,
    title: 'Nothing to install',
    body: 'Forge is a Docker-based GitHub Action. GitHub builds and runs it for you on its own runners — there is no package to add, no binary to vendor, and nothing to host. The workflow file is the entire installation.',
  },
  {
    Icon: KeyRound,
    title: 'One provider API key',
    body: 'An Anthropic, OpenAI, Gemini, Vertex, or Bedrock credential — whichever provider you pick below. You pay that provider directly at list price; there is no Forge account and no markup.',
  },
  {
    Icon: ShieldCheck,
    title: 'Permission to add a repository secret',
    body: 'Repository admin, or an organization owner if you want one secret shared across every repo. Settings → Secrets and variables → Actions. Paste the key there; the generated file only ever references its name.',
  },
  {
    Icon: ToggleRight,
    title: 'Actions enabled on the repository',
    body: 'Settings → Actions → General → "Allow all actions and reusable workflows". On a fresh private repo this is usually on already; on a hardened org it may need allowlisting.',
  },
];

export function Prerequisites() {
  return (
    <div className="space-y-6">
      <div className="grid gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.06] sm:grid-cols-2">
        {STEPS.map((s) => (
          <div key={s.title} className="bg-[rgb(11_11_14)] p-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5">
              <s.Icon size={18} />
            </span>
            <h3 className="mt-4 text-[15px] font-semibold">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-5">
        <h4 className="text-[13px] font-semibold text-amber-100/90">Pick the right Action version</h4>
        <p className="mt-2 max-w-3xl text-[12.5px] leading-relaxed text-muted">
          <code className="text-white/80">@v2</code> is the current release and the default here — it has every
          input this form can generate, and the <code className="text-white/80">v2</code> tag moves forward with
          each 2.x release. <code className="text-white/80">@v1</code> is the previous major: it predates skills,
          tool allowlists, per-run limits, and change history, so a workflow pinned to it will parse those inputs
          and ignore them. The field is in the <span className="text-text">Limits &amp; identity</span> step.
        </p>
      </div>

      <div>
        <h4 className="text-[13px] font-semibold text-text">Two minutes, start to finish</h4>
        <Code
          label="what you actually do"
          lang="bash"
          code={`# 1. Add your key as a repository secret
#    Settings → Secrets and variables → Actions → New repository secret
#    Name: ANTHROPIC_API_KEY      Value: sk-ant-...

# 2. Fill in the form below and download forge.yml

# 3. Commit it
mkdir -p .github/workflows
mv ~/Downloads/forge.yml .github/workflows/forge.yml
git add .github/workflows/forge.yml
git commit -m "ci: add ShipIT Forge" && git push

# 4. Open an issue and comment /fix — or open a PR and watch it review.`}
        />
      </div>
    </div>
  );
}
