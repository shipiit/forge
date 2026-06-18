/** A single review finding, produced by the agent in review mode. */
export interface ReviewFinding {
  file: string;
  startLine: number;
  endLine: number;
  lens: 'quality' | 'security';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;
  title: string;
  body: string;
  suggestion?: string;
}

const SEVERITY_BADGE: Record<ReviewFinding['severity'], string> = {
  critical: '🔴 **Critical**',
  high: '🟠 **High**',
  medium: '🟡 **Medium**',
  low: '🔵 **Low**',
  info: '⚪ **Info**',
};

const SEVERITY_RANK: Record<ReviewFinding['severity'], number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

export interface ReviewComment {
  path: string;
  line: number;
  start_line?: number;
  body: string;
}

export interface ReviewPayload {
  // ShipIT Forge NEVER approves a PR — only comments or requests changes.
  event: 'REQUEST_CHANGES' | 'COMMENT';
  body: string;
  comments: ReviewComment[];
}

/** Render one finding as the body of an inline review comment. */
export function renderFindingBody(f: ReviewFinding): string {
  const lensTag = f.lens === 'security' ? '🛡️ Security' : '🔧 Quality';
  let out = `${SEVERITY_BADGE[f.severity]} · ${lensTag} · \`${f.category}\`\n\n**${f.title}**\n\n${f.body}`;
  if (f.suggestion !== undefined) {
    out += `\n\n\`\`\`suggestion\n${f.suggestion}\n\`\`\``;
  }
  return out;
}

/** Build a summary grouped by severity. */
export function renderSummary(findings: ReviewFinding[], displayName: string): string {
  if (findings.length === 0) {
    return (
      `### ${displayName} review\n\n` +
      `✅ **No blocking issues found.** I reviewed the changed files and ran:\n` +
      `- 🛡️ **Security checks** — SSRF, injection (SQL/command/template), broken auth/authz, ` +
      `hardcoded secrets, unsafe deserialization, path traversal, weak crypto.\n` +
      `- 🔧 **Code review** — correctness, error handling, missing tests, clarity.\n\n` +
      `Nothing to flag. _This is a comment, not an approval — ${displayName} never approves PRs; ` +
      `a human reviewer should approve and merge._`
    );
  }
  const counts = findings.reduce<Record<string, number>>((acc, f) => {
    acc[f.severity] = (acc[f.severity] ?? 0) + 1;
    return acc;
  }, {});
  const order: ReviewFinding['severity'][] = ['critical', 'high', 'medium', 'low', 'info'];
  const tally = order
    .filter((s) => counts[s])
    .map((s) => `${SEVERITY_BADGE[s]}: ${counts[s]}`)
    .join(' · ');
  const sec = findings.filter((f) => f.lens === 'security').length;
  return (
    `### ${displayName} review\n\n` +
    `Found **${findings.length}** issue(s) (${sec} security). ${tally}\n\n` +
    `See inline comments for details and suggested fixes.`
  );
}

/**
 * Choose the review verdict. ShipIT Forge never approves — it requests changes when
 * there's a High/Critical finding, otherwise comments. Approval is always left to a human.
 */
export function chooseEvent(findings: ReviewFinding[]): ReviewPayload['event'] {
  const hasBlocker = findings.some((f) => SEVERITY_RANK[f.severity] >= SEVERITY_RANK.high);
  return hasBlocker ? 'REQUEST_CHANGES' : 'COMMENT';
}

/**
 * Parse a unified diff into the set of new-file line numbers that can carry an
 * inline review comment (added `+` lines and context lines on the RIGHT side).
 * GitHub returns 422 for inline comments on any other line, so we use this to
 * keep only valid comments and route the rest into the summary.
 */
export function parseDiffValidLines(diff: string): Map<string, Set<number>> {
  const map = new Map<string, Set<number>>();
  let file: string | null = null;
  let newLine = 0;
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('+++ ')) {
      const p = raw.slice(4).replace(/^b\//, '').trim();
      file = p === '/dev/null' ? null : p;
      if (file && !map.has(file)) map.set(file, new Set());
      continue;
    }
    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }
    if (!file) continue;
    if (raw.startsWith('+')) {
      map.get(file)!.add(newLine);
      newLine++;
    } else if (raw.startsWith('-')) {
      // removed line: does not advance the new-file counter
    } else if (raw.startsWith(' ') || raw === '') {
      map.get(file)!.add(newLine);
      newLine++;
    }
  }
  return map;
}

/**
 * Build the full GitHub review payload from findings. `securityOnly` keeps only
 * security-lens findings. When `validLines` is provided (parsed from the PR
 * diff), findings whose line is not commentable are moved into the summary body
 * instead of becoming inline comments (avoiding GitHub 422 errors).
 */
export function buildReviewPayload(
  findings: ReviewFinding[],
  opts: { displayName?: string; securityOnly?: boolean; validLines?: Map<string, Set<number>> } = {},
): ReviewPayload {
  const displayName = opts.displayName ?? 'ShipIT Forge';
  const filtered = opts.securityOnly ? findings.filter((f) => f.lens === 'security') : findings;

  const inlineable: ReviewFinding[] = [];
  const summaryOnly: ReviewFinding[] = [];
  for (const f of filtered) {
    if (!opts.validLines || opts.validLines.get(f.file)?.has(f.endLine)) inlineable.push(f);
    else summaryOnly.push(f);
  }

  const comments: ReviewComment[] = inlineable.map((f) => ({
    path: f.file,
    line: f.endLine,
    ...(f.startLine !== f.endLine && (!opts.validLines || opts.validLines.get(f.file)?.has(f.startLine))
      ? { start_line: f.startLine }
      : {}),
    body: renderFindingBody(f),
  }));

  let body = renderSummary(filtered, displayName);
  if (summaryOnly.length > 0) {
    body +=
      `\n\n#### Additional findings (outside the diff)\n` +
      summaryOnly.map((f) => `- \`${f.file}:${f.endLine}\` — ${SEVERITY_BADGE[f.severity]} ${f.title}`).join('\n');
  }
  return { event: chooseEvent(filtered), body, comments };
}

/**
 * Parse the agent's findings from its final text. The review prompt asks the
 * model to emit a JSON array (optionally inside a ```json fence). Returns [] on
 * any parse failure so a malformed response degrades to "no findings" instead of
 * crashing the review.
 */
export function parseFindings(text: string): ReviewFinding[] {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1]! : text;
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) return [];
  try {
    const arr = JSON.parse(raw.slice(start, end + 1)) as unknown[];
    return arr.filter(isFinding);
  } catch {
    return [];
  }
}

function isFinding(x: unknown): x is ReviewFinding {
  const f = x as Partial<ReviewFinding>;
  return (
    typeof f === 'object' &&
    f !== null &&
    typeof f.file === 'string' &&
    typeof f.endLine === 'number' &&
    typeof f.title === 'string' &&
    (f.severity === 'critical' ||
      f.severity === 'high' ||
      f.severity === 'medium' ||
      f.severity === 'low' ||
      f.severity === 'info')
  );
}
