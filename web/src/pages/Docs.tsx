import { Header, Footer } from '../components/Layout';
import { ScrollProgress } from '../components/ScrollProgress';
import { CodeBlock } from '../components/CodeBlock';
import { ProviderSetup } from '../components/ProviderSetup';

const GH = 'https://github.com/shipiit/forge/blob/main';
const ext = { target: '_blank', rel: 'noopener noreferrer' } as const;

const COMMANDS: [string, string][] = [
  ['label agent-fix / open issue', 'Posts a detailed analysis (root cause + proposed fix)'],
  ['/fix', 'Implements the fix, writes tests, opens a PR'],
  ['open a PR (automatic)', 'Code + security review with inline suggestions'],
  ['/review · /security', 'On-demand full or security-only review'],
  ['/audit', 'Full-repository security scan + Dependabot CVEs'],
  ['@shipit-forge …', 'Answer, or push a follow-up commit on a PR'],
];

const TOC = [['quickstart', 'Quick start'], ['provider', 'Configure a model'], ['deploy', 'Deploy 24/7'], ['commands', 'Commands'], ['install', 'Action vs App'], ['faq', 'FAQ']];

function H({ id, children }: { id: string; children: React.ReactNode }) {
  return <h2 id={id} className="display mt-14 scroll-mt-24 text-3xl first:mt-0">{children}</h2>;
}

export function Docs() {
  return (
    <>
      <ScrollProgress />
      <Header />
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-7 pt-14 md:grid-cols-[210px_1fr]">
        <aside className="sticky top-24 hidden self-start border-l border-white/[0.08] pl-4 md:block">
          {TOC.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="block py-1.5 text-sm text-muted hover:text-text">{label}</a>
          ))}
        </aside>

        <main className="pb-16">
          <span className="eyebrow">Documentation</span>
          <h1 className="display mt-6 text-[clamp(40px,6vw,64px)]">Up and running<br /><span className="dim">in minutes.</span></h1>

          <H id="quickstart">Quick start</H>
          <p className="text-muted">The engine runs locally with a built-in fake provider — no API keys needed.</p>
          <CodeBlock label="bash" code={`git clone https://github.com/shipiit/forge.git && cd forge
npm install && npm run build && npm test
node dist/cli.js fix --repo /path/to/repo --task "fix the failing login test" --provider fake`} />

          <H id="provider">Configure a model</H>
          <p className="text-muted">Bring your own model — pick a provider, get its credentials, and the same env vars work everywhere (CLI, GitHub Action secrets, hosted App). The quickest path is the wizard:</p>
          <CodeBlock label="forge setup" code={`node dist/cli.js setup   # choose a provider, paste your key — writes a gitignored .env (chmod 600)`} />
          <p className="mt-4 text-muted">Or follow the detailed steps for your provider below 👇</p>
          <ProviderSetup />
          <p className="mt-5 text-sm text-muted">
            Per-repo override (no secret change) via <a href={`${GH}/deploy/PROVIDERS.md`} {...ext}>PROVIDERS.md</a> and <code className="text-white/80">.github/agent.yml</code>:{' '}
            <code className="text-white/80">model: gemini-2.5-pro</code>. All four default models are vision-capable, so Forge reads screenshots in issues &amp; PRs automatically.
          </p>

          <H id="deploy">Deploy 24/7</H>
          <div className="mt-4 grid gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.06] md:grid-cols-3">
            {[
              ['Render', 'Connect the repo → builds the Dockerfile. ', `${GH}/deploy/RENDER.md`],
              ['Cloud Run', 'One command: ./deploy/cloudrun.sh. ', `${GH}/deploy/DEPLOY.md`],
              ['Any Docker host', 'Railway, Fly.io, a VPS — public HTTPS URL.', GH],
            ].map(([t, d, href]) => (
              <div key={t} className="bg-[rgb(11_11_14)] p-6">
                <h3 className="text-lg font-semibold">{t}</h3>
                <p className="mt-1.5 text-sm text-muted">{d}<a href={href} {...ext}>Guide ↗</a></p>
              </div>
            ))}
          </div>

          <H id="commands">Commands</H>
          <div className="overflow-hidden rounded-xl border border-white/[0.08]">
            {COMMANDS.map(([t, d], i) => (
              <div key={t} className={`grid grid-cols-1 gap-1 px-5 py-3.5 sm:grid-cols-[280px_1fr] ${i ? 'border-t border-white/[0.08]' : ''}`}>
                <code className="text-white/85">{t}</code>
                <span className="text-sm text-muted">{d}</span>
              </div>
            ))}
          </div>

          <H id="install">Two ways to install</H>
          <div className="grid gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.06] md:grid-cols-2">
            <div className="bg-[rgb(11_11_14)] p-6"><h3 className="text-lg font-semibold">⚡ GitHub Action</h3><p className="mt-1.5 text-sm text-muted">One workflow file + your key as a secret. No server, runs in your CI. <a href={`${GH}/deploy/GITHUB_ACTIONS.md`} {...ext}>Setup ↗</a></p></div>
            <div className="bg-[rgb(11_11_14)] p-6"><h3 className="text-lg font-semibold">🤖 Hosted App</h3><p className="mt-1.5 text-sm text-muted">Install org-wide with one click; you host the server. <a href={`${GH}/deploy/DEPLOY.md`} {...ext}>Setup ↗</a></p></div>
          </div>

          <H id="faq">FAQ</H>
          {[
            ['Does it burn tokens 24/7?', 'No. The server idles for free; the model only runs on a real event. The CI auto-fix loop is bounded to 2 attempts.'],
            ['Does it auto-approve PRs?', 'Never. It only comments or requests changes — approval is left to a human.'],
            ['Where does my code go?', 'Only to the LLM provider you configured. Repos are cloned into ephemeral sandboxes and deleted after each run.'],
          ].map(([q, a]) => (
            <details key={q} className="row-line py-1">
              <summary className="flex cursor-pointer list-none items-center justify-between py-4 font-semibold marker:hidden">{q}<span className="text-2xl font-light text-muted">+</span></summary>
              <p className="pb-4 text-muted">{a}</p>
            </details>
          ))}
        </main>
      </div>
      <Footer />
    </>
  );
}
