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
  /**
   * True when the issue already existed and was not introduced by this change.
   * Pre-existing findings are reported for awareness but never block a PR — the
   * author shouldn't be held up by a bug they didn't write.
   */
  preExisting?: boolean;
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
 *
 * Pre-existing findings never trigger REQUEST_CHANGES: they are surfaced for
 * awareness, but blocking a PR on a bug it didn't introduce just punishes whoever
 * happened to touch the file next.
 */
export function chooseEvent(findings: ReviewFinding[]): ReviewPayload['event'] {
  const hasBlocker = findings.some((f) => !f.preExisting && SEVERITY_RANK[f.severity] >= SEVERITY_RANK.high);
  return hasBlocker ? 'REQUEST_CHANGES' : 'COMMENT';
}

/**
 * Cap how many low-severity findings a single review posts inline. Prose and
 * config can be polished forever; an uncapped review buries the one finding that
 * mattered under twenty that didn't. Returns the kept findings plus the number
 * dropped, so the summary can say "plus N similar items".
 */
export function capNits(
  findings: ReviewFinding[],
  maxNits: number,
): { kept: ReviewFinding[]; dropped: number } {
  if (maxNits < 0) return { kept: findings, dropped: 0 };
  const isNit = (f: ReviewFinding) => SEVERITY_RANK[f.severity] <= SEVERITY_RANK.low;
  const kept: ReviewFinding[] = [];
  let nits = 0;
  let dropped = 0;
  for (const f of findings) {
    if (!isNit(f)) {
      kept.push(f);
      continue;
    }
    if (nits < maxNits) {
      kept.push(f);
      nits++;
    } else {
      dropped++;
    }
  }
  return { kept, dropped };
}

/**
 * Render a full-repo audit report (findings aren't tied to a PR diff, so they go
 * in one grouped markdown comment rather than inline). Sorted by severity.
 */
export function renderAuditReport(findings: ReviewFinding[], displayName: string): string {
  if (findings.length === 0) {
    return `### 🛡️ ${displayName} security audit\n\n✅ No vulnerabilities found across the scanned code.`;
  }
  const order: ReviewFinding['severity'][] = ['critical', 'high', 'medium', 'low', 'info'];
  const counts = order.filter((s) => findings.some((f) => f.severity === s)).map((s) => `${SEVERITY_BADGE[s]}: ${findings.filter((f) => f.severity === s).length}`);
  const sorted = [...findings].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
  const items = sorted
    .map(
      (f) =>
        `<details><summary>${SEVERITY_BADGE[f.severity]} · \`${f.category}\` · ${f.title} — <code>${f.file}:${f.startLine}</code></summary>\n\n${f.body}\n` +
        (f.suggestion ? `\n\`\`\`suggestion\n${f.suggestion}\n\`\`\`\n` : '') +
        `\n</details>`,
    )
    .join('\n');
  return (
    `### 🛡️ ${displayName} security audit\n\n` +
    `Found **${findings.length}** issue(s). ${counts.join(' · ')}\n\n${items}`
  );
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

/** The set of files touched by a unified diff (new-side paths). */
export function changedFiles(diff: string): string[] {
  const files = new Set<string>();
  for (const m of diff.matchAll(/^\+\+\+ (?:b\/)?(.+)$/gm)) {
    const p = m[1]!.trim();
    if (p && p !== '/dev/null') files.add(p);
  }
  return [...files];
}

/**
 * Keep only findings about code the change actually touched.
 *
 * A review is about *this* PR, not the repository. Without this, a reviewer
 * given read access to the whole tree will wander off and report issues in files
 * the author never opened — noise the author can't act on and didn't ask for.
 *
 * A finding explicitly marked `preExisting` is kept when it lands on a changed
 * file: that is the "you touched this file, note that it already has a bug"
 * case, which is useful. Findings on untouched files are dropped entirely.
 */
export function scopeFindingsToDiff(findings: ReviewFinding[], diff: string): ReviewFinding[] {
  const touched = new Set(changedFiles(diff));
  if (touched.size === 0) return findings;
  const normalize = (p: string) => p.replace(/^\.?\//, '');
  const touchedNorm = new Set([...touched].map(normalize));
  return findings.filter((f) => touchedNorm.has(normalize(f.file)));
}

/**
 * Build the full GitHub review payload from findings. `securityOnly` keeps only
 * security-lens findings. When `validLines` is provided (parsed from the PR
 * diff), findings whose line is not commentable are moved into the summary body
 * instead of becoming inline comments (avoiding GitHub 422 errors).
 */
export function buildReviewPayload(
  findings: ReviewFinding[],
  opts: {
    displayName?: string;
    securityOnly?: boolean;
    validLines?: Map<string, Set<number>>;
    /** Nits withheld by the cap, mentioned as a count instead of posted. */
    droppedNits?: number;
  } = {},
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
  if (opts.droppedNits && opts.droppedNits > 0) {
    body += `\n\n_Plus ${opts.droppedNits} similar minor item(s), withheld to keep this review actionable._`;
  }
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
