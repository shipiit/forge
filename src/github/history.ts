/**
 * The change-history document.
 *
 * Every merged change gets one entry describing what actually changed and why,
 * written from the diff of THAT change alone. The point is a document a human
 * can read months later to answer "when did this behaviour change, and why" —
 * something a commit log of "fix stuff" never answers.
 *
 * Rendering and insertion are pure so the exact document shape is unit-tested;
 * the handler does the I/O.
 */

export const HISTORY_HEADER = '# Change history';

const HEADER_BLOCK =
  `${HISTORY_HEADER}\n\n` +
  `_Maintained automatically. Each entry describes one merged change, written from that change's diff._\n`;

export interface HistoryEntry {
  /** ISO date (YYYY-MM-DD). Passed in — never derived from a clock here. */
  date: string;
  title: string;
  /** PR number when the change arrived as a PR. */
  pullNumber?: number;
  /** Short commit sha when the change arrived as a push. */
  sha?: string;
  author?: string;
  /** One-paragraph description of what changed and why. */
  summary: string;
  /** Files or subsystems touched. */
  areas: string[];
  risk?: 'low' | 'medium' | 'high';
  /** Behaviour changes a consumer would notice. */
  notable?: string[];
}

const RISK_BADGE: Record<NonNullable<HistoryEntry['risk']>, string> = {
  low: '🟢 low',
  medium: '🟡 medium',
  high: '🔴 high',
};

/** Escape characters that would break out of a markdown table cell or heading. */
function safe(s: string): string {
  return String(s ?? '').replace(/\r?\n/g, ' ').trim();
}

export function renderHistoryEntry(entry: HistoryEntry): string {
  const ref = entry.pullNumber ? `#${entry.pullNumber}` : entry.sha ? `\`${entry.sha.slice(0, 7)}\`` : '';
  const heading = `## ${entry.date} — ${safe(entry.title)}${ref ? ` (${ref})` : ''}`;

  const meta: string[] = [];
  if (entry.author) meta.push(`**Author:** ${safe(entry.author)}`);
  if (entry.risk) meta.push(`**Risk:** ${RISK_BADGE[entry.risk]}`);
  if (entry.areas.length) meta.push(`**Areas:** ${entry.areas.map((a) => `\`${safe(a)}\``).join(', ')}`);

  const parts = [heading, '', meta.join(' · '), '', entry.summary.trim()];
  if (entry.notable?.length) {
    parts.push('', '**Notable behaviour changes**', ...entry.notable.map((n) => `- ${safe(n)}`));
  }
  return parts.filter((p, i) => !(p === '' && parts[i - 1] === '')).join('\n');
}

/**
 * Insert an entry at the top of the document, newest first, creating the file
 * body if it doesn't exist yet. Existing entries are never rewritten — the
 * history is append-only from the reader's perspective.
 */
export function insertHistoryEntry(existing: string, entryMarkdown: string): string {
  const body = (existing ?? '').trim();
  if (!body) return `${HEADER_BLOCK}\n${entryMarkdown}\n`;

  const idx = body.indexOf('\n## ');
  if (idx === -1) {
    // Header only, no entries yet.
    return `${body}\n\n${entryMarkdown}\n`;
  }
  const head = body.slice(0, idx);
  const rest = body.slice(idx + 1);
  return `${head}\n\n${entryMarkdown}\n\n${rest}\n`;
}

/**
 * Filename for one-file-per-change mode.
 *
 * Date-prefixed so a directory listing is chronological, slugged from the title
 * so it is readable, and suffixed with the PR number or short sha so two changes
 * with the same title can never collide.
 */
export function historyFilename(entry: HistoryEntry): string {
  const slug =
    entry.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'change';
  const ref = entry.pullNumber ? `pr-${entry.pullNumber}` : (entry.sha ?? '').slice(0, 7) || 'commit';
  return `${entry.date}-${slug}-${ref}.md`;
}

/** The full document written in one-file-per-change mode. */
export function renderHistoryFile(entry: HistoryEntry): string {
  return `${renderHistoryEntry(entry)}\n`;
}

/** True when this change is already recorded, so a redelivered webhook is a no-op. */
export function alreadyRecorded(existing: string, entry: HistoryEntry): boolean {
  if (entry.pullNumber && new RegExp(`\\(#${entry.pullNumber}\\)`).test(existing)) return true;
  if (entry.sha && existing.includes(entry.sha.slice(0, 7))) return true;
  return false;
}

/**
 * Parse the agent's structured entry from its final text. Same tolerance as the
 * review parser: a malformed response degrades to null rather than throwing.
 */
export function parseHistoryPayload(text: string): Pick<HistoryEntry, 'summary' | 'areas' | 'risk' | 'notable'> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1]! : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    const o = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    const summary = typeof o.summary === 'string' ? o.summary : '';
    if (!summary) return null;
    const risk = o.risk === 'low' || o.risk === 'medium' || o.risk === 'high' ? o.risk : undefined;
    return {
      summary,
      areas: Array.isArray(o.areas) ? o.areas.filter((a): a is string => typeof a === 'string') : [],
      ...(risk ? { risk } : {}),
      ...(Array.isArray(o.notable)
        ? { notable: o.notable.filter((n): n is string => typeof n === 'string') }
        : {}),
    };
  } catch {
    return null;
  }
}
