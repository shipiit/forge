import { parseFindings, type ReviewFinding } from '../github/review.js';
import { COVERAGE_ROWS, DYNAMIC_ONLY_ROWS } from './slices.js';

export type Verdict = 'PASS' | 'FAIL' | 'WARNING' | 'NOT TESTED';

export interface CoverageEntry {
  row: number;
  verdict: Verdict;
  note: string;
}

export interface SliceReport {
  findings: ReviewFinding[];
  coverage: CoverageEntry[];
  checked: string[];
  notTested: string[];
}

const VERDICTS: ReadonlySet<string> = new Set(['PASS', 'FAIL', 'WARNING', 'NOT TESTED']);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isVerdict(v: unknown): v is Verdict {
  return typeof v === 'string' && VERDICTS.has(v);
}

function strings(v: unknown, max = 40): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, max).map((s) => s.slice(0, 300)) : [];
}

/**
 * One slice's answer. Takes the object the prompt asks for; falls back to a
 * bare findings array, so a model that forgets the envelope still counts.
 */
export function parseSliceReport(text: string): SliceReport {
  const empty: SliceReport = { findings: [], coverage: [], checked: [], notTested: [] };
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const doc: unknown = JSON.parse(text.slice(start, end + 1));
      if (isRecord(doc) && Array.isArray(doc.findings)) {
        const coverage = (Array.isArray(doc.coverage) ? doc.coverage : []).flatMap((c): CoverageEntry[] =>
          isRecord(c) && typeof c.row === 'number' && c.row in COVERAGE_ROWS && isVerdict(c.verdict)
            ? [{ row: c.row, verdict: c.verdict, note: typeof c.note === 'string' ? c.note.slice(0, 300) : '' }]
            : [],
        );
        return {
          findings: parseFindings(JSON.stringify(doc.findings)),
          coverage,
          checked: strings(doc.checked),
          notTested: strings(doc.notTested),
        };
      }
    } catch {
      // Not the envelope; try the bare array below.
    }
  }
  return { ...empty, findings: parseFindings(text) };
}

const RANK: Record<Verdict, number> = { FAIL: 3, WARNING: 2, PASS: 1, 'NOT TESTED': 0 };

/**
 * One verdict per row across every slice: the worst one wins, because a row
 * one specialist passed and another failed has failed. A FAIL whose findings
 * the verifier then dropped becomes a WARNING — the slice suspected something
 * the code did not bear out. Rows nobody reported on are NOT TESTED, with why.
 */
export function mergeCoverage(
  entries: Array<CoverageEntry & { slice: string }>,
  opts: { confirmedSlices: ReadonlySet<string>; ranRows: ReadonlySet<number> },
): CoverageEntry[] {
  const best = new Map<number, CoverageEntry>();
  for (const e of entries) {
    const adjusted: CoverageEntry =
      e.verdict === 'FAIL' && !opts.confirmedSlices.has(e.slice)
        ? { row: e.row, verdict: 'WARNING', note: `${e.note} (suspected; not confirmed by verification)`.trim() }
        : { row: e.row, verdict: e.verdict, note: e.note };
    const seen = best.get(e.row);
    if (!seen || RANK[adjusted.verdict] > RANK[seen.verdict]) best.set(e.row, adjusted);
  }
  return Object.keys(COVERAGE_ROWS)
    .map(Number)
    .map((row) => {
      const got = best.get(row);
      if (got) return got;
      const why = DYNAMIC_ONLY_ROWS[row] ?? (opts.ranRows.has(row) ? 'the slice returned no verdict' : 'no slice covered it in this run');
      return { row, verdict: 'NOT TESTED' as const, note: why };
    });
}

const BADGE: Record<Verdict, string> = { PASS: '✅ PASS', FAIL: '❌ FAIL', WARNING: '⚠️ WARNING', 'NOT TESTED': '➖ NOT TESTED' };

function cell(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/** The coverage map as a collapsible Markdown table. */
export function renderCoverage(coverage: CoverageEntry[], slices: string[]): string {
  const counts = (['FAIL', 'WARNING', 'PASS', 'NOT TESTED'] as const).map((v) => `${coverage.filter((c) => c.verdict === v).length} ${v.toLowerCase()}`);
  return [
    '<details><summary><strong>Coverage map</strong> — ' + counts.join(' · ') + '</summary>',
    '',
    '| # | Area | Verdict | Evidence |',
    '|---:|---|---|---|',
    ...coverage.map((c) => `| ${c.row} | ${COVERAGE_ROWS[c.row]} | ${BADGE[c.verdict]} | ${cell(c.note) || '—'} |`),
    '',
    `<sub>Specialists this run: ${slices.join(', ')}. A static audit reads code; it never runs it.</sub>`,
    '',
    '</details>',
  ].join('\n');
}
