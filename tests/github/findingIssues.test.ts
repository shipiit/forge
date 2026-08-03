import { describe, it, expect } from 'vitest';
import {
  FINDING_LABEL,
  fingerprint,
  fingerprintMarker,
  issueBody,
  issueTitle,
  labelsFor,
  rollupBody,
  rollupTitle,
  selectForIssues,
  trackedFingerprints,
} from '../../src/github/findingIssues.js';
import type { ReviewFinding } from '../../src/github/review.js';

const finding = (over: Partial<ReviewFinding> = {}): ReviewFinding => ({
  file: 'src/proxy.ts',
  startLine: 8,
  endLine: 8,
  lens: 'security',
  severity: 'critical',
  category: 'CWE-918',
  title: 'SSRF via unvalidated URL',
  body: 'The target URL is attacker-controlled and reaches an internal endpoint.',
  ...over,
});

describe('fingerprinting', () => {
  it('is stable for the same finding', () => {
    expect(fingerprint(finding())).toBe(fingerprint(finding()));
  });

  it('ignores the line number, because code moves', () => {
    // A finding that shifts from line 8 to line 47 is the same finding.
    expect(fingerprint(finding({ endLine: 47, startLine: 47 }))).toBe(fingerprint(finding()));
  });

  it('ignores the body, which the model rephrases run to run', () => {
    expect(fingerprint(finding({ body: 'worded differently this time' }))).toBe(fingerprint(finding()));
  });

  it('differs by file, category, and title', () => {
    const base = fingerprint(finding());
    expect(fingerprint(finding({ file: 'src/other.ts' }))).not.toBe(base);
    expect(fingerprint(finding({ category: 'CWE-79' }))).not.toBe(base);
    expect(fingerprint(finding({ title: 'Something else' }))).not.toBe(base);
  });

  it('is short and hex, so it stays readable in a body', () => {
    expect(fingerprint(finding())).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe('recognizing already-tracked findings', () => {
  it('extracts every marker from open issue bodies', () => {
    const fp1 = fingerprint(finding());
    const fp2 = fingerprint(finding({ file: 'a.ts' }));
    const tracked = trackedFingerprints([
      `something\n${fingerprintMarker(fp1)}`,
      `rollup\n${fingerprintMarker(fp1)}\n${fingerprintMarker(fp2)}`,
    ]);
    expect(tracked.has(fp1)).toBe(true);
    expect(tracked.has(fp2)).toBe(true);
    expect(tracked.size).toBe(2);
  });

  it('tolerates empty and unrelated bodies', () => {
    expect(trackedFingerprints(['', 'no markers here']).size).toBe(0);
  });
});

describe('selecting what becomes an issue', () => {
  const many = [
    finding({ severity: 'critical', title: 'A' }),
    finding({ severity: 'high', title: 'B' }),
    finding({ severity: 'medium', title: 'C' }),
    finding({ severity: 'low', title: 'D' }),
    finding({ severity: 'info', title: 'E' }),
  ];

  it('applies the severity floor', () => {
    const s = selectForIssues(many, { minSeverity: 'high' });
    expect(s.selected.map((f) => f.title)).toEqual(['A', 'B']);
    expect(s.belowThreshold).toBe(3);
  });

  it('skips anything an open issue already tracks', () => {
    const tracked = new Set([fingerprint(many[0]!)]);
    const s = selectForIssues(many, { minSeverity: 'high', tracked });
    expect(s.selected.map((f) => f.title)).toEqual(['B']);
    expect(s.duplicates).toBe(1);
  });

  it('files nothing at all on a re-run where everything is tracked', () => {
    // The behaviour that decides whether this feature survives contact with a
    // weekly audit: run it twice, get issues once.
    const tracked = new Set(many.map(fingerprint));
    const s = selectForIssues(many, { minSeverity: 'info', tracked });
    expect(s.selected).toEqual([]);
    expect(s.duplicates).toBe(5);
  });

  it('caps how many issues one run can open, keeping the most severe', () => {
    const s = selectForIssues(many, { minSeverity: 'info', maxIssues: 2 });
    expect(s.selected.map((f) => f.severity)).toEqual(['critical', 'high']);
    expect(s.truncated).toBe(3);
  });

  it('includes pre-existing findings — a bug is a bug', () => {
    const s = selectForIssues([finding({ preExisting: true })], { minSeverity: 'high' });
    expect(s.selected).toHaveLength(1);
  });

  it('handles an empty finding list', () => {
    const s = selectForIssues([], { minSeverity: 'high' });
    expect(s).toEqual({ selected: [], duplicates: 0, belowThreshold: 0, truncated: 0 });
  });
});

describe('the per-finding issue', () => {
  it('titles itself with the category, problem, and file', () => {
    const t = issueTitle(finding(), 'ShipIT Forge');
    expect(t).toContain('CWE-918');
    expect(t).toContain('SSRF');
    expect(t).toContain('src/proxy.ts');
  });

  it('never exceeds GitHub`s title limit', () => {
    expect(issueTitle(finding({ title: 'x'.repeat(500) }), 'F').length).toBeLessThanOrEqual(240);
  });

  it('carries the location, severity, and the fingerprint', () => {
    const b = issueBody(finding(), { displayName: 'ShipIT Forge' });
    expect(b).toContain('src/proxy.ts:8');
    expect(b).toContain('Critical');
    expect(b).toContain(fingerprintMarker(fingerprint(finding())));
  });

  it('includes a suggested fix when there is one', () => {
    expect(issueBody(finding({ suggestion: 'validateUrl(target)' }), { displayName: 'F' })).toContain('```suggestion');
  });

  it('says when a finding predates the change', () => {
    expect(issueBody(finding({ preExisting: true }), { displayName: 'F' })).toMatch(/already existed/i);
  });

  it('links back to where it was found', () => {
    const b = issueBody(finding(), { displayName: 'F', sourceUrl: 'https://github.com/o/r/issues/1' });
    expect(b).toContain('https://github.com/o/r/issues/1');
  });

  it('labels by lens and severity as well as the marker', () => {
    expect(labelsFor(finding())).toEqual([FINDING_LABEL, 'forge:security', 'forge:critical']);
  });
});

describe('the rollup issue', () => {
  const two = [finding({ title: 'A' }), finding({ title: 'B', file: 'src/b.ts', severity: 'high' })];

  it('is a checklist, so it can be triaged in one sitting', () => {
    const b = rollupBody(two, { displayName: 'ShipIT Forge' });
    expect(b.match(/- \[ \]/g)).toHaveLength(2);
    expect(b).toContain('src/proxy.ts:8');
    expect(b).toContain('src/b.ts:8');
  });

  it('carries every fingerprint, so a later run sees them all as tracked', () => {
    const b = rollupBody(two, { displayName: 'F' });
    for (const f of two) expect(b).toContain(fingerprintMarker(fingerprint(f)));
    expect(trackedFingerprints([b]).size).toBe(2);
  });

  it('says what it left out rather than hiding it', () => {
    const b = rollupBody(two, {
      displayName: 'F',
      selection: { selected: two, duplicates: 3, belowThreshold: 7, truncated: 2 },
    });
    expect(b).toContain('3 already tracked');
    expect(b).toContain('7 below the severity floor');
    expect(b).toContain("2 beyond this run's limit");
  });

  it('counts correctly in the title', () => {
    expect(rollupTitle('ShipIT Forge', '2026-08-03', 1)).toContain('1 finding to triage');
    expect(rollupTitle('ShipIT Forge', '2026-08-03', 4)).toContain('4 findings to triage');
    expect(rollupTitle('ShipIT Forge', '2026-08-03', 4)).toContain('2026-08-03');
  });
});
