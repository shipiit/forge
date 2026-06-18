import { Header, Footer } from '../components/Layout';
import { CodeBlock } from '../components/CodeBlock';

const GH = 'https://github.com/shipiit/forge/blob/main';

const COMMANDS: [string, string][] = [
  ['label `agent-fix` / open issue', 'Posts a detailed analysis (root cause + proposed fix)'],
  ['`/fix`', 'Implements the fix, writes tests, opens a PR'],
  ['open a PR (automatic)', 'Code + security review with inline suggestions'],
  ['`/review` · `/security`', 'On-demand full or security-only review'],
  ['`/audit`', 'Full-repository security scan + Dependabot CVEs'],
  ['`@shipit-forge …`', 'Answer, or push a follow-up commit on a PR'],
];

function Cmd({ text }: { text: string }) {
  // render `code` spans inside a table cell
  const parts = text.split(/`([^`]+)`/);
  return (
    <>
      {parts.map((p, i) => (i % 2 ? <code key={i}>{p}</code> : <span key={i}>{p}</span>))}
    </>
  );
}

export function Docs() {
  return (
    <>
      <Header />
      <div className="wrap doc">
        <aside className="toc">
          <a href="#quickstart">Quick start</a>
          <a href="#provider">Configure a model</a>
          <a href="#deploy">Deploy 24/7</a>
          <a href="#commands">Commands</a>
          <a href="#install">Action vs App</a>
          <a href="#faq">FAQ</a>
        </aside>

        <main>
          <div className="eyebrow">Documentation</div>
          <h1 style={{ fontSize: 38, letterSpacing: '-.02em' }}>
            Up and running in <span className="grad">minutes.</span>
          </h1>

          <h2 id="quickstart">Quick start (no credentials)</h2>
          <p className="sub">The engine runs locally with a built-in fake provider — no API keys needed.</p>
          <CodeBlock
            label="bash"
            code={`git clone https://github.com/shipiit/forge.git && cd forge
npm install && npm run build && npm test
# run the agent on any repo with the credential-free demo provider
node dist/cli.js fix --repo /path/to/repo --task "fix the failing login test" --provider fake`}
          />

          <h2 id="provider">Configure a model</h2>
          <p className="sub">
            Pick Vertex Gemini, AWS Bedrock, OpenAI, or Anthropic — your key, saved to a gitignored <code>.env</code>.
          </p>
          <CodeBlock label="forge setup" code={`node dist/cli.js setup   # interactive: choose provider, paste your key`} />
          <p>
            Full per-provider setup: <a href={`${GH}/deploy/PROVIDERS.md`}>PROVIDERS.md</a>.
          </p>

          <h2 id="deploy">Deploy 24/7 (your repo, your keys)</h2>
          <div className="grid g3" style={{ marginTop: 6 }}>
            <div className="card">
              <div className="ic">▲</div>
              <h3>Render</h3>
              <p>
                Connect the repo → builds the Dockerfile → set env vars. <a href={`${GH}/deploy/RENDER.md`}>Guide ↗</a>
              </p>
            </div>
            <div className="card">
              <div className="ic">☁️</div>
              <h3>Cloud Run</h3>
              <p>
                One command: <code>./deploy/cloudrun.sh</code>. <a href={`${GH}/deploy/DEPLOY.md`}>Guide ↗</a>
              </p>
            </div>
            <div className="card">
              <div className="ic">🐳</div>
              <h3>Any Docker host</h3>
              <p>Railway, Fly.io, a VPS — it just needs a public HTTPS URL.</p>
            </div>
          </div>

          <h2 id="commands">Commands</h2>
          <table className="cfg">
            <thead>
              <tr>
                <th>Trigger</th>
                <th>What Forge does</th>
              </tr>
            </thead>
            <tbody>
              {COMMANDS.map(([t, d]) => (
                <tr key={t}>
                  <td>
                    <Cmd text={t} />
                  </td>
                  <td>{d}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 id="install">Two ways to install</h2>
          <div className="grid g2">
            <div className="card">
              <h3>⚡ GitHub Action</h3>
              <p>
                Add one workflow file + your key as a secret. No server, runs in your CI, each org uses its own
                credentials. <a href={`${GH}/deploy/GITHUB_ACTIONS.md`}>Setup ↗</a>
              </p>
            </div>
            <div className="card">
              <h3>🤖 Hosted App</h3>
              <p>
                Install org-wide with one click; you host the server (one-click permissions screen like any GitHub
                App). <a href={`${GH}/deploy/DEPLOY.md`}>Setup ↗</a>
              </p>
            </div>
          </div>

          <h2 id="faq">FAQ</h2>
          <details className="faq">
            <summary>Does it burn tokens 24/7?</summary>
            <p>
              No. The server idles for free; the model only runs on a real event. No polling. The CI auto-fix loop is
              bounded to 2 attempts.
            </p>
          </details>
          <details className="faq">
            <summary>Does it auto-approve PRs?</summary>
            <p>Never. It only comments or requests changes — approval is always left to a human.</p>
          </details>
          <details className="faq">
            <summary>Is the security data up to date?</summary>
            <p>
              Yes — the model's knowledge plus live Dependabot alerts from GitHub's Advisory Database, and optional
              CodeQL/SARIF ingestion.
            </p>
          </details>
          <details className="faq">
            <summary>Where does my code go?</summary>
            <p>
              Only to the LLM provider you configured, using your key. Repos are cloned into ephemeral sandboxes and
              deleted after each run. Secrets never touch the repo.
            </p>
          </details>
        </main>
      </div>
      <Footer />
    </>
  );
}
