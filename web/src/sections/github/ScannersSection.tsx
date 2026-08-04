import { ScanSearch } from 'lucide-react';
import { Section, Triggers, CommentPreview } from '../../components/GuideBits';

/** What runs before the model, and what it costs (nothing). */
const SCANS: Array<[string, string]> = [
  ['Secrets', 'Twelve provider shapes, Shannon entropy for generic assignments, and file context.'],
  ['Injection', 'Request data reaching a shell command, a file path, or a redirect.'],
  ['Credentials in logs', 'A password or token written to a log, where it outlives everything.'],
  ['Deserialization', 'pickle and yaml.load, which reconstruct arbitrary objects and so run them.'],
  ['Containers', 'Running as root, :latest bases, remote ADD, privileged compose services.'],
  ['Kubernetes', 'Privileged pods and host-path mounts.'],
  ['Terraform', '0.0.0.0/0, public buckets, encryption switched off.'],
  ['Workflows', 'Mutable action pins, pull_request_target, untrusted event text reaching a shell.'],
];

export function ScannersSection() {
  return (
    <Section
      id="scanners"
      Icon={ScanSearch}
      eyebrow="Security"
      title="Three passes, one report"
      lead="A model is good at judging whether something is reachable and worth worrying about. It is unreliable at checking four thousand lines the same way twice. So the deterministic scanners run first — credentials, infrastructure, and the source code itself — cost no tokens, and give the same answer every time. Their findings are merged and deduplicated with the model's, so one weakness that both notice arrives as one comment rather than three."
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_460px]">
        <div>
          <Triggers rows={SCANS} />

          <h3 className="mt-8 text-sm font-semibold text-text">On demand, or before every merge</h3>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Comment <code className="text-[rgb(var(--syn-keyword))]">/secrets</code> for a report grouped by rule
            with every location, or leave{' '}
            <code className="text-[rgb(var(--syn-keyword))]">secret_scan</code> and{' '}
            <code className="text-[rgb(var(--syn-keyword))]">code_scan</code> on — both default to on — and it
            runs on every pull request, whatever the review cadence is, and publishes a check run that blocks
            the merge once you mark it required. It needs no model call, so it is instant and costs nothing.
            The same is true in Actions: the{' '}
            <code className="text-[rgb(var(--syn-keyword))]">secret-scan</code> and{' '}
            <code className="text-[rgb(var(--syn-keyword))]">code-scan</code> inputs are on unless you set them
            to <code className="text-[rgb(var(--syn-string))]">'0'</code>.
          </p>

          <h3 className="mt-8 text-sm font-semibold text-text">Not crying wolf is the hard part</h3>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            A regex-only scanner is mostly false positives, and a scanner people stop reading is worse than
            none. <code className="text-[rgb(var(--syn-string))]">your-api-key-here</code> is not a finding.{' '}
            <code className="text-[rgb(var(--syn-keyword))]">secretName: 'ANTHROPIC_API_KEY'</code> is a name,
            not a value. A PEM header with nothing under it is an install guide showing the shape. A real key
            in a README <em>is</em> reported, at lower severity — because people do paste real keys into
            documentation, and staying quiet there is quiet exactly where the mistake is easiest to make.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            The code rules earn their quiet the same way. Every one of them needs two things on the same line:
            something attacker-controlled, and something dangerous done with it — the rule that fires on every{' '}
            <code className="text-[rgb(var(--syn-fn))]">exec</code> is the rule you switch off in a week. Taint
            is matched against the code on the line and not its prose, so{' '}
            <code className="text-[rgb(var(--syn-string))]">'… using the workflow token.'</code> is a sentence
            about a credential rather than a leaked one — that line is ours, and it was the first false
            positive this scanner produced. Comment-only lines are skipped, because a comment describing a bug
            is not the bug. And a finding in a test drops to low rather than vanishing: a scanner's own suite
            has to contain what it detects, but a key pasted into a fixture is still a key.
          </p>

          <h3 className="mt-8 text-sm font-semibold text-text">Dismissing one, so it stays dismissed</h3>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Resolve the conversation and that finding will not come back on the pull request. To dismiss it
            everywhere, write the reason where the code is:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-xl border border-white/[0.08] bg-black/30 p-4 font-mono text-[12.5px] leading-relaxed">
            <span className="text-[rgb(var(--syn-keyword))]">const</span> token ={' '}
            <span className="text-[rgb(var(--syn-string))]">'ghp_…'</span>;{' '}
            <span className="text-[rgb(var(--syn-comment))]">// forge-ignore: secrets — fixture</span>
          </pre>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            It covers that line, never the file — so a marker written last year cannot hide what was added
            under it since. And unlike a dismissal stored in somebody's dashboard, this one arrives through
            review and the next reader can see both the dismissal and the reason for it.
          </p>
        </div>

        <CommentPreview verdict="2 findings" tone="danger">
          <p className="text-muted">
            <span className="text-text">.github/workflows/deploy.yml</span> · line 9
          </p>
          <div className="row-line pt-3 font-semibold">
            Untrusted event text interpolated into a shell command — 🔴 Critical · 🛡️ Security ·{' '}
            <code className="text-[rgb(var(--syn-fn))]">CWE-78</code>
          </div>
          <p className="text-muted">An issue title is written by whoever opened it.</p>
          <p className="text-[rgb(var(--syn-comment))]">▸ Why this matters</p>

          <div className="row-line pt-3 font-semibold">
            Container runs as root — 🟡 Medium · 🛡️ Security ·{' '}
            <code className="text-[rgb(var(--syn-fn))]">CWE-250</code>
          </div>
          <p className="text-muted">
            <span className="text-text">Dockerfile</span> · line 5 — the image explicitly drops back to root.
          </p>
        </CommentPreview>
      </div>
    </Section>
  );
}
