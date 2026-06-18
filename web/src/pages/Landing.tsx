import { Link } from 'react-router-dom';
import { Header, Footer } from '../components/Layout';
import { LogoHero } from '../components/Logo';
import { Reveal } from '../components/Reveal';

const GITHUB = 'https://github.com/shipiit/forge';

const FEATURES = [
  { i: '🛠️', t: 'Fix issues → PRs', d: 'Investigates, installs deps, edits, writes tests, runs them, and opens a verified pull request.' },
  { i: '🔍', t: 'Reviews every PR', d: 'Automatic code + security review with inline comments, severity, and suggested fixes. Never auto-approves.' },
  { i: '🛡️', t: 'Security & vuln scan', d: 'Full CWE/OWASP coverage plus live Dependabot CVE data. /audit scans the whole repo.' },
  { i: '🔁', t: 'Auto-fixes CI', d: "When its own PR's CI fails, it reads the logs and pushes a fix — bounded so it never loops." },
  { i: '💬', t: '@mention anywhere', d: '@shipit-forge fix this on a PR pushes a follow-up commit; on an issue it answers or opens a PR.' },
  { i: '🔌', t: 'Bring your own model', d: 'Vertex Gemini, Bedrock, OpenAI, or Anthropic — your key, your compute, one env var to swap.' },
];

const FLOW = ['📥 Issue / PR', '📦 Sandbox clone', '🤖 Agent loop', '✅ Verify', '🚀 PR / review'];

export function Landing() {
  return (
    <>
      <Header onLanding />
      <div className="hero">
        <div className="mesh">
          <i className="a" />
          <i className="b" />
          <i className="c" />
        </div>
        <div className="wrap">
          <div>
            <span className="pill">🛡️ Autonomous · Multi-provider · Self-hosted</span>
            <h1 style={{ marginTop: 16 }}>
              Your repo's <span className="grad">autonomous</span>
              <br />
              engineering teammate.
            </h1>
            <p className="sub">
              Reads issues, opens fix PRs, reviews pull requests with a GitHub Advanced Security–style scan,
              auto-fixes failing CI, and audits your whole repo — all from real GitHub events. Bring your own model.
            </p>
            <div className="cta">
              <Link className="btn btn-p" to="/docs">
                Get started →
              </Link>
              <a className="btn btn-g" href={GITHUB}>
                ⭐ Star on GitHub
              </a>
            </div>
            <div className="chips">
              <span>Vertex&nbsp;Gemini</span>
              <span>AWS&nbsp;Bedrock</span>
              <span>OpenAI</span>
              <span>Anthropic</span>
              <span>👁 Vision</span>
            </div>
          </div>
          <div className="logocard">
            <LogoHero />
          </div>
        </div>
      </div>

      <section id="features">
        <div className="wrap">
          <div className="eyebrow">What it does</div>
          <h2>
            One agent. The whole <span className="grad">engineering loop.</span>
          </h2>
          <div className="grid g3" style={{ marginTop: 26 }}>
            {FEATURES.map((f, n) => (
              <Reveal key={f.t} delay={(n % 3) * 70} className="card">
                <div className="ic">{f.i}</div>
                <h3>{f.t}</h3>
                <p>{f.d}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="how" style={{ background: 'linear-gradient(180deg,transparent,#0d1430,transparent)' }}>
        <div className="wrap center">
          <div className="eyebrow">How it works</div>
          <h2>
            Event-driven. <span className="grad">No polling, no idle burn.</span>
          </h2>
          <p className="sub lead">
            Forge wakes only on real GitHub events, clones into a sandbox, runs the agent loop with real tools,
            verifies, and writes back. Each run is isolated and disposable.
          </p>
          <div className="flow">
            {FLOW.map((n, i) => (
              <span key={n} style={{ display: 'contents' }}>
                <div className="node">{n}</div>
                {i < FLOW.length - 1 && <div className="arrow" />}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section id="examples">
        <div className="wrap">
          <div className="eyebrow">Live examples</div>
          <h2>
            Real output, <span className="grad">straight from GitHub.</span>
          </h2>
          <p className="sub" style={{ marginBottom: 24 }}>
            Actual comments &amp; reviews ShipIT Forge posts.
          </p>
          <div className="grid g2">
            <Reveal className="gh">
              <div className="hd">
                <span className="av">🔨</span>
                <span className="who">shipit-forge</span>
                <span className="bot">bot</span>
                <span style={{ color: '#7d8590' }}>requested changes</span>
              </div>
              <div className="bd">
                <h4>ShipIT Forge review</h4>
                <p>
                  Found <b>2</b> issue(s). <span className="sev c">🔴 Critical: 2</span>
                </p>
                <p>
                  <span className="tag">CWE-918</span>
                  <span className="sev c">SSRF</span> in <code>fetcher.js:8</code> — URL is fully attacker-controlled.
                </p>
                <div className="diff">
                  <div className="del">- request(target, (r) =&gt; r.pipe(res)).end();</div>
                  <div className="sg">+ request(validateUrl(target), (r) =&gt; r.pipe(res)).end();</div>
                </div>
              </div>
            </Reveal>
            <Reveal delay={70} className="gh">
              <div className="hd">
                <span className="av">🔨</span>
                <span className="who">shipit-forge</span>
                <span className="bot">bot</span>
              </div>
              <div className="bd">
                <h4>🔧 Fix ready in #128</h4>
                <p>
                  <b>Root cause:</b> <code>add()</code> used <code>-</code> instead of <code>+</code>.
                </p>
                <p>
                  <b>Files:</b> <code>sum.js</code>, <code>sum.test.js</code> (added a regression test).
                </p>
                <p>
                  <b>Verification:</b> <span className="sev ok">✅ tests pass.</span>
                </p>
                <div className="diff">
                  <div className="del">- return a - b;</div>
                  <div className="add">+ return a + b;</div>
                </div>
              </div>
            </Reveal>
            <Reveal className="gh">
              <div className="hd">
                <span className="av">🔨</span>
                <span className="who">shipit-forge</span>
                <span className="bot">bot</span>
              </div>
              <div className="bd">
                <h4>🔁 CI failed — pushed a fix (1/2)</h4>
                <p>
                  The type check failed; I corrected the signature and re-ran the suite. <span className="sev ok">✅ Green.</span>
                </p>
                <p style={{ color: '#7d8590' }}>Bounded to 2 attempts — never loops.</p>
              </div>
            </Reveal>
            <Reveal delay={70} className="gh">
              <div className="hd">
                <span className="av">🔨</span>
                <span className="who">shipit-forge</span>
                <span className="bot">bot</span>
              </div>
              <div className="bd">
                <h4>🛡️ Security audit</h4>
                <p>Scanned the whole repo + live Dependabot alerts.</p>
                <p>
                  <span className="sev h">🟠 High</span> <code>CVE-2021-23337</code> — vulnerable <code>lodash</code>, fixed in <b>4.17.21</b>.
                </p>
                <p>
                  <span className="sev ok">✅</span> No injection / SSRF / authz issues in source.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="center">
        <div className="wrap">
          <h2>
            Ship faster with an agent that
            <br />
            <span className="grad">actually finishes the job.</span>
          </h2>
          <div className="cta" style={{ justifyContent: 'center', marginTop: 22 }}>
            <Link className="btn btn-p" to="/docs">
              Read the docs →
            </Link>
            <a className="btn btn-g" href={GITHUB}>
              Get ShipIT Forge
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
