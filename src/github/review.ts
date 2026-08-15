import { commentMarker } from './threads.js';

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

/** The first sentence, for the line somebody reads in the diff. */
function lede(body: string, max = 220): string {
  const first = body.trim().split(/(?<=[.!?])\s+/)[0] ?? body.trim();
  const one = first.replace(/\s+/g, ' ');
  return one.length > max ? `${one.slice(0, max - 1).trimEnd()}…` : one;
}

/**
 * Render one finding as the body of an inline review comment.
 *
 * Title first, severity beside it, one sentence of why — that is what somebody
 * scanning a diff has room for. Everything else is folded: the full reasoning
 * and the suggested change are one click away, and a reviewer with six comments
 * on screen can still see the code between them.
 */
export function renderFindingBody(
  f: ReviewFinding,
  opts: { inline?: boolean; withSuggestion?: boolean } = {},
): string {
  const inline = opts.inline ?? true;
  const withSuggestion = opts.withSuggestion ?? true;
  const lensTag = f.lens === 'security' ? '🛡️ Security' : '🔧 Quality';
  const rest = f.body.trim().slice(lede(f.body).length).trim();

  // Outside the diff the title is already the summary of the block this sits
  // in, so repeating it is just noise; the severity line is still worth
  // having because the collapsed summary is all most people read.
  const heading = inline
    ? `**${f.title}** — ${SEVERITY_BADGE[f.severity]} · ${lensTag} · \`${f.category}\``
    : `${SEVERITY_BADGE[f.severity]} · ${lensTag} · \`${f.category}\``;
  let out = `${heading}\n\n${lede(f.body)}`;

  if (rest) {
    out += `\n\n<details><summary>Why this matters</summary>\n\n${rest}\n\n</details>`;
  }
  if (f.suggestion !== undefined && withSuggestion) {
    // Kept out of the collapsed block: GitHub only offers "Commit suggestion"
    // on a suggestion it can see.
    out += `\n\n\`\`\`suggestion\n${f.suggestion}\n\`\`\``;
  }
  // How to make it go away, said once, quietly. Both mechanisms already
  // existed and neither was discoverable: people were left with a comment and
  // no way to disagree with it except to argue in a reply.
  //
  // Outside the diff there is no conversation to resolve — GitHub would not
  // accept an inline comment there — so offering that is telling somebody to
  // click something that does not exist.
  out += inline
    ? `\n\n<sub>Resolve this conversation to dismiss it, or add \`// forge-ignore: ${f.lens}\` on that line to dismiss it everywhere.</sub>`
    : `\n\n<sub>To dismiss this, add \`// forge-ignore: ${f.lens} — reason\` on that line.</sub>`;

  // Identity for re-review: lets a later run skip this finding instead of
  // posting it again, and resolve the thread once it is fixed.
  out += `\n\n${commentMarker(f)}`;
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
/**
 * The text of each line the diff shows, per file.
 *
 * Same walk as `parseDiffValidLines`, keeping the content rather than just the
 * number, so a suggestion can be checked against what it would actually
 * replace before it is offered as a commit.
 */
export function parseDiffLineText(diff: string): Map<string, Map<number, string>> {
  const map = new Map<string, Map<number, string>>();
  let file: string | null = null;
  let newLine = 0;
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('+++ ')) {
      const p = raw.slice(4).replace(/^b\//, '').trim();
      file = p === '/dev/null' ? null : p;
      if (file && !map.has(file)) map.set(file, new Map());
      continue;
    }
    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }
    if (!file) continue;
    if (raw.startsWith('+') || raw.startsWith(' ') || raw === '') {
      map.get(file)!.set(newLine, raw.slice(1));
      newLine++;
    }
  }
  return map;
}

/** A line that is only a comment, in the languages a review touches. */
const COMMENT_ONLY = /^\s*(?:\/\/|\/\*|\*|#|<!--|--)/;

/**
 * Should this suggestion be offered as a commit?
 *
 * GitHub applies a suggestion to the exact lines it is attached to, so one
 * anchored a few lines off does not read as slightly wrong — it produces
 * broken code with a "Commit suggestion" button under it. The check that
 * catches this in practice: a comment line being replaced by something that is
 * not a comment means the finding landed on the wrong line, because no real
 * fix turns an explanation into an instruction.
 */
export function suggestionFits(f: ReviewFinding, lineText?: string): boolean {
  if (f.suggestion === undefined) return false;
  if (lineText === undefined) return true; // nothing to check it against
  const replacingComment = COMMENT_ONLY.test(lineText) && lineText.trim() !== '';
  if (!replacingComment) return true;
  // Rewriting a comment as a comment is fine — a typo, a stale note.
  return f.suggestion.split('\n').every((l) => l.trim() === '' || COMMENT_ONLY.test(l));
}

/**
 * The line a comment should actually hang on.
 *
 * A model asked for a range often gives one that ends on a blank line or a
 * closing brace — the end of the block it was describing, not the code. GitHub
 * anchors the comment to the last line, so the reader opens a finding about
 * arbitrary code execution and sees an empty `+`. Observed exactly that:
 * "Comment on lines +114 to +115" over two blank additions.
 *
 * So walk back from the end of the range to the last line that carries code.
 * Nothing in the range does — the whole range is blank — and the original
 * line stands, because moving a comment somewhere arbitrary is worse than
 * leaving it where the model meant it.
 */
export function anchorLine(
  f: ReviewFinding,
  valid?: Set<number>,
  lineText?: Map<number, string>,
): number {
  if (!lineText) return f.endLine;
  const meaningful = (n: number): boolean => {
    const t = lineText.get(n);
    if (t === undefined) return false;
    const trimmed = t.trim();
    // A brace or a bracket alone is a line of code, but it is not the line
    // anyone wants to read a security finding against.
    return trimmed !== '' && !/^[)\]}\s,;]*$/.test(trimmed);
  };
  if (meaningful(f.endLine)) return f.endLine;
  for (let n = f.endLine - 1; n >= f.startLine; n--) {
    if ((!valid || valid.has(n)) && meaningful(n)) return n;
  }
  return f.endLine;
}

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
    /** For deep links on findings that cannot be commented on inline. */
    repoUrl?: string;
    ref?: string;
    /** Diff line text, so a misplaced suggestion is not offered as a commit. */
    lineText?: Map<string, Map<number, string>>;
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

  const comments: ReviewComment[] = inlineable.map((f) => {
    const line = anchorLine(f, opts.validLines?.get(f.file), opts.lineText?.get(f.file));
    return {
      path: f.file,
      line,
      ...(f.startLine !== f.endLine &&
      f.startLine < line &&
      (!opts.validLines || opts.validLines.get(f.file)?.has(f.startLine))
        ? { start_line: f.startLine }
        : {}),
      body: renderFindingBody(f, {
        withSuggestion: suggestionFits(f, opts.lineText?.get(f.file)?.get(line)),
      }),
    };
  });

  let body = renderSummary(filtered, displayName);
  if (opts.droppedNits && opts.droppedNits > 0) {
    body += `\n\n_Plus ${opts.droppedNits} similar minor item(s), withheld to keep this review actionable._`;
  }
  if (summaryOnly.length > 0) {
    body += `\n\n#### Additional findings (outside the diff)\n\n${outOfDiff(summaryOnly, opts.repoUrl, opts.ref)}`;
  }
  return { event: chooseEvent(filtered), body, comments };
}

/**
 * Findings on lines this pull request did not touch.
 *
 * GitHub will not accept an inline comment outside the diff, so these have
 * nowhere to live but the summary — and a bare line naming a file is the one
 * form of finding nobody can act on. Reported at one line each they read as
 * noise; given the same body an inline comment would have had, they read as
 * the review they are. Each is collapsed, so ten of them do not bury the
 * findings that are in the diff, and each links to the exact line.
 */
function outOfDiff(findings: ReviewFinding[], repoUrl?: string, ref?: string): string {
  return findings
    .map((f) => {
      // HTML, not markdown. GitHub does not parse markdown inside a <summary>,
      // so `**Medium**` and a `[text](url)` link render as their own source —
      // which is what shipped, and it looked broken because it was.
      const at = `${f.file}:${f.endLine}`;
      const where =
        repoUrl && ref
          ? `<a href="${repoUrl}/blob/${ref}/${f.file}#L${f.endLine}"><code>${at}</code></a>`
          : `<code>${at}</code>`;
      const summary = `${HTML_BADGE[f.severity]} · ${escapeHtml(f.title)} — ${where}`;
      return `<details><summary>${summary}</summary>\n\n${renderFindingBody(f, {
        inline: false,
        // There is no "Commit suggestion" button outside the diff, so a
        // suggestion block down here is a code sample pretending to be one.
        withSuggestion: false,
      })}\n\n</details>`;
    })
    .join('\n');
}

/** The same badges, in HTML, for the places markdown is not parsed. */
const HTML_BADGE: Record<ReviewFinding['severity'], string> = {
  critical: '🔴 <strong>Critical</strong>',
  high: '🟠 <strong>High</strong>',
  medium: '🟡 <strong>Medium</strong>',
  low: '🔵 <strong>Low</strong>',
  info: '⚪ <strong>Info</strong>',
};

/** A finding title comes from a model; it must not be able to close the tag. */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
