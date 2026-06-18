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
  event: 'REQUEST_CHANGES' | 'COMMENT' | 'APPROVE';
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
    return `### ${displayName} review\n\n✅ No issues found. Looks good!`;
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

/** Choose the review verdict: request changes if any High/Critical finding exists. */
export function chooseEvent(findings: ReviewFinding[]): ReviewPayload['event'] {
  if (findings.length === 0) return 'APPROVE';
  const hasBlocker = findings.some((f) => SEVERITY_RANK[f.severity] >= SEVERITY_RANK.high);
  return hasBlocker ? 'REQUEST_CHANGES' : 'COMMENT';
}

/**
 * Build the full GitHub review payload from findings. `securityOnly` keeps only
 * security-lens findings (for the `/security` command).
 */
export function buildReviewPayload(
  findings: ReviewFinding[],
  opts: { displayName?: string; securityOnly?: boolean } = {},
): ReviewPayload {
  const displayName = opts.displayName ?? 'ShipIT Forge';
  const filtered = opts.securityOnly ? findings.filter((f) => f.lens === 'security') : findings;
  const comments: ReviewComment[] = filtered.map((f) => ({
    path: f.file,
    line: f.endLine,
    ...(f.startLine !== f.endLine ? { start_line: f.startLine } : {}),
    body: renderFindingBody(f),
  }));
  return { event: chooseEvent(filtered), body: renderSummary(filtered, displayName), comments };
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
