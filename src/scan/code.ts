import type { ReviewFinding } from '../github/review.js';
import type { ScanFile, Scanner } from './types.js';

/**
 * Source-code rules, the deterministic half of a security review.
 *
 * Every rule here needs two things on the same line: something that is
 * attacker-controlled, and something dangerous done with it. A rule that fires
 * on the sink alone — every `exec`, every `readFile` — is a rule people turn
 * off in a week, and a scanner nobody reads is worse than no scanner. The model
 * still does the cross-file reasoning; this is the pass that never gets bored.
 */

/** Where untrusted input comes from, in the languages this covers. */
const TAINT =
  /\b(?:req|request)\.(?:query|params|body|headers|cookies)\b|\bprocess\.argv\b|\bevent\.(?:body|queryStringParameters|pathParameters)\b|\bflask\.request\.(?:args|form|json|values)\b|\brequest\.(?:GET|POST|args|form)\b|\bos\.environ\.get\(['"](?!NODE_ENV|PORT|HOME)/;

/** Names that mean the value should never be written down. */
const SENSITIVE = /\b(?:password|passwd|secret|token|api[_-]?key|credential|private[_-]?key|authorization|session[_-]?id)\b/i;

interface Rule {
  id: string;
  /** Language hint; a rule only runs on files it can be true for. */
  applies: RegExp;
  match: RegExp;
  /** Also required in the *code* on the line — string contents do not count. */
  needs?: RegExp;
  /** Suppresses the rule when it matches — the mitigation. */
  unless?: RegExp;
  severity: ReviewFinding['severity'];
  category: string;
  title: string;
  body: string;
}

const JS = /\.(?:js|jsx|ts|tsx|mjs|cjs)$/;
const PY = /\.py$/;
const ANY = /\.(?:js|jsx|ts|tsx|mjs|cjs|py|rb|go|java|php)$/;
const WORKFLOW = /\.github\/workflows\/[^/]+\.ya?ml$/;

/**
 * Test and fixture files, where vulnerable-looking code is usually the point.
 *
 * A scanner's own test suite has to contain the thing it detects, and so does
 * every regression test anybody writes against it. Reported at full severity
 * these drown the real findings — so they are downgraded rather than dropped,
 * because a credential pasted into a test is still a credential, and a fixture
 * is sometimes just production code that was moved and never renamed.
 */
const TEST_PATH = /(?:^|\/)(?:tests?|__tests__|spec|fixtures?|__mocks__)\/|\.(?:test|spec)\.[jt]sx?$/i;

/**
 * The line with its prose taken out, keeping only what is really code.
 *
 * `console.log(`… using the workflow token.`)` contains the word "token" and
 * logs nothing sensitive at all. Matching taint against the whole line makes
 * every log message that *mentions* a credential look like one that leaks it,
 * and that single false positive is enough for somebody to stop reading the
 * report. String literals are dropped; interpolations are kept, because
 * `f"password={password}"` is a real leak hiding inside a string.
 */
function codeOnly(line: string): string {
  return line.replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g, (literal) => {
    const inner = literal.slice(1, -1);
    const interpolations = [...inner.matchAll(/\$?\{([^{}]*)\}/g)].map((m) => m[1]);
    return ` ${interpolations.join(' ')} `;
  });
}

/**
 * A line that is only a comment.
 *
 * Comments describe code, including code that would be a finding — the rule
 * table in this very file logs a fake credential in its own documentation. A
 * scanner that cannot tell prose about a bug from the bug is one that reports
 * its own explanation of itself.
 */
const COMMENT = /^\s*(?:\/\/|\/?\*|#|<!--|--)/;

const RULES: Rule[] = [
  {
    id: 'clear-text-logging',
    applies: ANY,
    match: /\b(?:console\.(?:log|info|warn|error|debug)|logger?\.(?:info|warn|error|debug|log)|print|println|fmt\.Print\w*)\s*\(/,
    needs: SENSITIVE,
    // A redacted or masked value is the correct handling, not a finding.
    // The asterisks sit outside the word boundary: a space followed by `*` is
    // not one, so `\b` would have stopped "password: ***" from matching.
    unless: /\b(?:redact|mask|sanitiz|scrub)|\*{3,}/i,
    severity: 'high',
    category: 'CWE-532',
    title: 'Clear-text logging of sensitive information',
    body:
      'A credential is being written to the log. Logs are copied to aggregators, shipped to third parties, ' +
      'read by people who are not allowed the secret itself, and kept far longer than anybody intends. ' +
      'Log the fact, never the value — an identifier, a length, or nothing.',
  },
  {
    id: 'exception-exposure',
    applies: JS,
    match: /\b(?:res|response)\.(?:send|json|status\(\d+\)\.(?:send|json))\s*\(\s*(?:\w*[eE]rr\w*(?:\.(?:stack|message))?|\{[^}]*\b(?:stack|err(?:or)?)\b)/,
    severity: 'medium',
    category: 'CWE-209',
    title: 'Information exposure through an exception',
    body:
      'An error object is being returned to the caller. Stack traces name your file paths, your framework ' +
      'versions and often the query that failed — a map of the application, handed to whoever triggered the ' +
      'error. Return an opaque message and an identifier; log the detail server-side.',
  },
  {
    id: 'open-redirect',
    applies: JS,
    match: /\b(?:res|response)\.redirect\s*\(/,
    needs: TAINT,
    unless: /\b(?:allowlist|whitelist|startsWith|URL\(|new URL)/,
    severity: 'medium',
    category: 'CWE-601',
    title: 'URL redirection from a remote source',
    body:
      'The redirect target comes from the request. A link to your own domain that lands on somebody else’s ' +
      'is the oldest phishing primitive there is, and it inherits your reputation. Redirect only to a path ' +
      'you control, or check the destination against an allowlist of hosts.',
  },
  {
    id: 'path-injection',
    applies: ANY,
    match: /\b(?:readFile|readFileSync|writeFile|writeFileSync|createReadStream|createWriteStream|sendFile|unlink|open)\s*\(/,
    needs: TAINT,
    unless: /\b(?:basename|path\.resolve\([^)]*\)\.startsWith|sanitiz|allowlist)/,
    severity: 'high',
    category: 'CWE-22',
    title: 'Uncontrolled data used in a path expression',
    body:
      'A filename derived from the request reaches the filesystem. `../` is all it takes to walk out of the ' +
      'directory you meant, and the interesting files — configuration, keys, /etc/passwd — are all reachable ' +
      'from anywhere. Take the basename, then resolve and verify the result is still inside the directory.',
  },
  {
    id: 'command-injection',
    applies: ANY,
    match: /\b(?:exec|execSync|spawn|spawnSync|execFile|system|popen|os\.system|subprocess\.(?:run|call|Popen))\s*\(/,
    needs: TAINT,
    unless: /shell:\s*false/,
    severity: 'critical',
    category: 'CWE-78',
    title: 'Uncontrolled command line',
    body:
      'Request data reaches a shell command. A semicolon, a backtick or `$( )` in that value runs as a ' +
      'command with the privileges of the process, which is remote code execution rather than a bug. Pass ' +
      'arguments as an array with no shell, and validate the value against what it is allowed to be.',
  },
  {
    id: 'unsafe-deserialization',
    applies: PY,
    match: /\b(?:pickle|cPickle|dill)\.loads?\s*\(|\byaml\.load\s*\(/,
    unless: /SafeLoader|safe_load|Loader\s*=\s*yaml\.CSafeLoader/,
    severity: 'critical',
    category: 'CWE-502',
    title: 'Deserialization of untrusted data',
    body:
      '`pickle` and `yaml.load` reconstruct arbitrary Python objects, which means they run arbitrary code — ' +
      'a crafted payload is remote code execution before your first line of validation. Use `yaml.safe_load`, ' +
      'or JSON, and if the format truly has to be pickle then sign the payload and verify before loading.',
  },
  {
    id: 'bind-all-interfaces',
    applies: ANY,
    match: /\.(?:listen|bind)\s*\([^)]*['"]0\.0\.0\.0['"]|['"]0\.0\.0\.0['"]\s*,\s*\d+/,
    severity: 'medium',
    category: 'CWE-1327',
    title: 'Binding a socket to all network interfaces',
    body:
      'Binding 0.0.0.0 exposes the service on every interface the host has, including ones you did not have ' +
      'in mind — a management network, a VPN, a cloud metadata range. Bind 127.0.0.1 and put a proxy in ' +
      'front, unless being reachable from everywhere is the point.',
  },
  {
    id: 'workflow-no-permissions',
    applies: WORKFLOW,
    match: /^on:/m,
    unless: /^\s*permissions:/m,
    severity: 'medium',
    category: 'CWE-732',
    title: 'Workflow does not restrict its permissions',
    body:
      'With no `permissions:` block the job gets the repository default, which is often write on everything. ' +
      'Any action it runs, and any dependency of any action it runs, inherits that token. Declare the ' +
      'permissions the job actually needs — usually `contents: read`.',
  },
];

export const codeScanner: Scanner = {
  name: 'code',
  handles(path) {
    return ANY.test(path) || WORKFLOW.test(path);
  },

  scan(file: ScanFile): ReviewFinding[] {
    const out: ReviewFinding[] = [];
    const lines = file.text.split('\n');
    const isTest = TEST_PATH.test(file.path);

    for (const rule of RULES) {
      if (!rule.applies.test(file.path)) continue;

      // Whole-file rules (a missing block) have nothing to point at but the top.
      if (rule.unless && !rule.needs && rule.unless.flags.includes('m')) {
        if (rule.match.test(file.text) && !rule.unless.test(file.text)) {
          out.push(finding(rule, file.path, 1, isTest));
        }
        continue;
      }

      lines.forEach((line, i) => {
        if (line.length > 500 || COMMENT.test(line)) return;
        if (!rule.match.test(line)) return;
        if (rule.needs && !rule.needs.test(codeOnly(line))) return;
        if (rule.unless?.test(line)) return;
        out.push(finding(rule, file.path, i + 1, isTest));
      });
    }
    return out;
  },
};

function finding(rule: Rule, file: string, line: number, isTest = false): ReviewFinding {
  return {
    file,
    startLine: line,
    endLine: line,
    lens: 'security',
    // Never blocking from a test file, but never silent either.
    severity: isTest ? 'low' : rule.severity,
    category: rule.category,
    title: rule.title,
    body: isTest
      ? `${rule.body}\n\nThis is a test file, so it is reported at low severity and will not block a merge — ` +
        'but check that the value here is a fixture and not something real that was moved.'
      : rule.body,
  };
}
