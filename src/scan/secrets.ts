import type { ReviewFinding } from '../github/review.js';
import type { ScanFile, Scanner } from './types.js';

/**
 * Secret detection.
 *
 * A regex-only secret scanner is mostly false positives, and a scanner people
 * stop reading is worse than none. Three signals are combined: a
 * provider-specific pattern (a real `ghp_` token has a shape), Shannon entropy
 * (a real key looks random; `your-api-key-here` does not), and the context the
 * line sits in (an example, a test fixture, or a placeholder is not a leak).
 */

interface Rule {
  id: string;
  label: string;
  /** Provider patterns are exact enough to report without an entropy check. */
  pattern: RegExp;
  severity?: ReviewFinding['severity'];
  entropy?: number;
  /** Suppresses the rule when it matches the line — the case that is not a leak. */
  unless?: RegExp;
}

/** Providers whose tokens have a documented, unmistakable shape. */
const PROVIDER_RULES: Rule[] = [
  { id: 'github-pat', label: 'GitHub personal access token', pattern: /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/ },
  { id: 'github-fine', label: 'GitHub fine-grained token', pattern: /\bgithub_pat_[A-Za-z0-9_]{22,255}\b/ },
  { id: 'aws-key', label: 'AWS access key id', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { id: 'anthropic', label: 'Anthropic API key', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  // Anchored away from sk-ant-, which it would otherwise swallow and report twice.
  { id: 'openai', label: 'OpenAI API key', pattern: /\bsk-(?!ant-)(?:proj-)?[A-Za-z0-9_-]{20,}\b/ },
  { id: 'google', label: 'Google API key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { id: 'slack', label: 'Slack token', pattern: /\bxox[abposr]-[0-9A-Za-z-]{10,}\b/ },
  { id: 'stripe', label: 'Stripe secret key', pattern: /\bsk_(?:live|test)_[0-9A-Za-z]{16,}\b/ },
  { id: 'npm', label: 'npm access token', pattern: /\bnpm_[A-Za-z0-9]{36}\b/ },
  { id: 'private-key', label: 'Private key', pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { id: 'jwt', label: 'JSON Web Token', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/, severity: 'medium' },
  {
    id: 'pg-url',
    label: 'Database connection string with a password',
    pattern: /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:@/]+:[^\s:@/]+@/,
    // Not when it points at the developer's own machine or a compose service
    // name. There is no remote system on the other end of localhost, so there
    // is nothing to compromise — and every project's example file has one.
    unless: /@(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|db|database|postgres|mysql|redis|mongo|host\.docker\.internal)[:/\s]/i,
  },
];

/** Generic assignments — only a finding when the value also looks random. */
const ASSIGNMENT =
  /(?:^|[^A-Za-z0-9_])(?:api[_-]?key|secret|token|passwd|password|access[_-]?key|private[_-]?key|client[_-]?secret|auth)[A-Za-z0-9_]*\s*[:=]\s*["'`]([^"'`\n]{12,})["'`]/i;

/**
 * Words that mean "this is not a real one", in any casing.
 *
 * Bounded by letters rather than \b: a placeholder is usually written
 * REPLACE_ME or your-key-here, and `_` counts as a word character, so \b would
 * not fire on the very spellings people actually use.
 */
const PLACEHOLDER =
  /(?<![A-Za-z])(?:example|sample|placeholder|dummy|fake|test|redacted|changeme|your|xxx+|todo|replace|insert|notreal|password|passwd|username|user|secret|mypassword|hostname|dbname|<[^>]+>|\.\.\.)(?![A-Za-z])/i;

/**
 * Paths where a credential-shaped string is documentation, not a leak.
 *
 * The extension is checked separately: `(?:^|\/)` in front of an alternation
 * containing `\.md$` requires the dot to follow a slash, so deploy/GUIDE.md was
 * not recognised as documentation at all.
 */
const DOC_PATH = /(?:^|\/)(?:\.env\.example|README|CHANGELOG|LICENSE|docs?\/|examples?\/)|\.mdx?$/i;
const TEST_PATH = /(?:^|\/)(?:tests?|__tests__|spec|fixtures?|__mocks__)\//i;

/** Shannon entropy in bits per character. Random keys sit well above 3.5. */
export function entropy(s: string): number {
  if (!s) return 0;
  const counts = new Map<string, number>();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let bits = 0;
  for (const n of counts.values()) {
    const p = n / s.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

/**
 * A name, not a value: ANTHROPIC_API_KEY, anthropic-api-key, defaultSecret.
 *
 * Words joined by separators score high on entropy while carrying no secret at
 * all — `secretName: 'ANTHROPIC_API_KEY'` is the name of the thing to look up.
 * A real key does not decompose into alphabetic words.
 */
function looksLikeAnIdentifier(value: string): boolean {
  const parts = value.split(/[-_.]/);
  return parts.length >= 2 && parts.every((p) => /^[A-Za-z]+$/.test(p));
}

/** True when the value is random enough to be a real credential. */
export function looksRandom(value: string): boolean {
  if (value.length < 12) return false;
  if (PLACEHOLDER.test(value)) return false;
  if (looksLikeAnIdentifier(value)) return false;
  // A path, a URL, or a sentence is long without being random.
  if (/\s/.test(value) || value.startsWith('/') || /^https?:\/\//.test(value)) return false;
  // An interpolated or computed value is not a hardcoded secret by definition:
  // `max-output-tokens: "${c.maxOutputTokens}"` is code, not a credential.
  if (/\$\{|\$\(|<%|\{\{/.test(value)) return false;
  return entropy(value) >= 3.5;
}

/**
 * A PEM header with no key material under it is documentation.
 *
 * Install guides and UI copy show `-----BEGIN RSA PRIVATE KEY-----` followed by
 * an ellipsis. A real key has base64 body; that is the difference, and it is
 * the only reliable one.
 */
function hasKeyMaterial(text: string): boolean {
  return text.split('\n').some((l) => /^[A-Za-z0-9+/=]{40,}$/.test(l.trim()));
}

function finding(
  file: string,
  line: number,
  rule: { id: string; label: string; severity?: ReviewFinding['severity'] },
  matched: string,
  note: string,
): ReviewFinding {
  return {
    file,
    startLine: line,
    endLine: line,
    lens: 'security',
    severity: rule.severity ?? 'critical',
    category: 'CWE-798',
    title: `${rule.label} committed to the repository`,
    body:
      `A value matching a ${rule.label.toLowerCase()} is in the source. ${note}\n\n` +
      'Treat it as compromised: anything in git history is readable by anyone who can clone the ' +
      'repository, and rotating is the only fix — removing the line does not unpublish it. Rotate the ' +
      'credential, then read it from the environment or a secret store instead.\n\n' +
      `Matched: \`${matched.slice(0, 12)}…\` (${matched.length} chars)`,
  };
}

export const secretsScanner: Scanner = {
  name: 'secrets',

  handles(path) {
    // Lockfiles are enormous and full of high-entropy hashes that are not secrets.
    return !/(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|\.min\.js|\.map)$/.test(path);
  },

  scan(file: ScanFile): ReviewFinding[] {
    const out: ReviewFinding[] = [];
    const isDoc = DOC_PATH.test(file.path);
    const isTest = TEST_PATH.test(file.path);

    file.text.split('\n').forEach((line, i) => {
      if (line.length > 1000) return; // minified or generated

      for (const rule of PROVIDER_RULES) {
        const m = line.match(rule.pattern);
        if (!m) continue;
        const value = m[0];
        if (rule.unless?.test(line)) continue;
        // The placeholder test applies to the token, not the sentence around
        // it. Reading the whole line meant "set KEY=sk-ant-… in your shell"
        // was dismissed because the prose said "your" — a real key, silently
        // dropped, in the file where people are most likely to paste one.
        if (PLACEHOLDER.test(value) && !/-----BEGIN/.test(value)) continue;
        // A PEM header with nothing under it is somebody showing the shape.
        if (/-----BEGIN/.test(value) && !hasKeyMaterial(file.text)) continue;
        out.push(
          finding(
            file.path,
            i + 1,
            // Documentation is downgraded, never dropped: people do paste real
            // keys into a README, and a scanner that stays silent there is
            // silent exactly where the mistake is easiest to make.
            // Documentation and test fixtures are downgraded, never dropped: a
            // real token in either is still a real token, but reporting a
            // fixture as critical is how a scanner gets muted.
            isDoc || isTest ? { ...rule, severity: 'medium' as const } : rule,
            value,
            isDoc
              ? 'It sits in documentation, so it may be an example — verify before rotating.'
              : isTest
                ? 'It sits in test code, which is still a public file.'
                : 'The pattern is specific to that provider, so this is very unlikely to be a coincidence.',
          ),
        );
      }

      // Generic `secret = "..."` needs the value to look random as well.
      const g = line.match(ASSIGNMENT);
      if (g?.[1] && looksRandom(g[1]) && !isDoc) {
        out.push(
          finding(
            file.path,
            i + 1,
            { id: 'generic', label: 'Credential', severity: isTest ? 'medium' : 'high' },
            g[1],
            `The name says credential and the value has ${entropy(g[1]).toFixed(1)} bits of entropy per character, which is what a real key looks like rather than a placeholder.`,
          ),
        );
      }
    });

    return out;
  },
};
