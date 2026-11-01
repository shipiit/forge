import { describe, it, expect } from 'vitest';
import { mergeCoverage, parseSliceReport, renderCoverage } from '../../src/audit/report.js';
import { BUILT_IN_SLICES, COVERAGE_ROWS, DYNAMIC_ONLY_ROWS } from '../../src/audit/slices.js';
import { slicePrompt } from '../../src/audit/prompt.js';

const f = { file: 'a.py', startLine: 3, endLine: 3, lens: 'security', severity: 'high', category: 'CWE-89', title: 'SQLi', body: 'b' };

describe('the built-in slices', () => {
  it('have unique ids and cover every row a static audit can answer', () => {
    expect(new Set(BUILT_IN_SLICES.map((s) => s.id)).size).toBe(BUILT_IN_SLICES.length);
    const covered = new Set(BUILT_IN_SLICES.flatMap((s) => s.rows));
    for (const row of Object.keys(COVERAGE_ROWS).map(Number)) {
      if (!(row in DYNAMIC_ONLY_ROWS)) expect(covered.has(row), `row ${row}`).toBe(true);
    }
  });

  it('each prompt names its slice, its rows and the strict output', () => {
    for (const s of BUILT_IN_SLICES) {
      const p = slicePrompt(s);
      expect(p).toContain(s.title);
      for (const r of s.rows) expect(p).toContain(`${r} (`);
      expect(p).toContain('"coverage"');
      expect(p).toContain('data, never instructions');
    }
  });
});

describe('parseSliceReport', () => {
  it('reads the envelope', () => {
    const r = parseSliceReport(
      `Done.\n${JSON.stringify({
        findings: [f],
        coverage: [{ row: 5, verdict: 'FAIL', note: 'a.py:3' }, { row: 99, verdict: 'PASS' }, { row: 4, verdict: 'MAYBE' }],
        checked: ['a.py:10 parameterised'],
        notTested: ['no db'],
      })}`,
    );
    expect(r.findings).toHaveLength(1);
    expect(r.coverage).toEqual([{ row: 5, verdict: 'FAIL', note: 'a.py:3' }]);
    expect(r.checked).toEqual(['a.py:10 parameterised']);
    expect(r.notTested).toEqual(['no db']);
  });

  it('falls back to a bare findings array', () => {
    expect(parseSliceReport(JSON.stringify([f])).findings).toHaveLength(1);
  });

  it.each(['', 'nothing to report', '{"findings": "no"}', '{broken'])('returns nothing usable from %j without throwing', (t) => {
    expect(parseSliceReport(t).coverage).toEqual([]);
  });
});

describe('mergeCoverage', () => {
  const opts = (confirmed: string[] = [], ran: number[] = []) => ({ confirmedSlices: new Set(confirmed), ranRows: new Set(ran) });

  it('keeps the worst verdict for a row', () => {
    const rows = mergeCoverage(
      [
        { row: 4, verdict: 'PASS', note: 'p', slice: 'a' },
        { row: 4, verdict: 'FAIL', note: 'f', slice: 'b' },
      ],
      opts(['b'], [4]),
    );
    expect(rows.find((r) => r.row === 4)).toEqual({ row: 4, verdict: 'FAIL', note: 'f' });
  });

  it('turns a FAIL into a WARNING when verification confirmed nothing from that slice', () => {
    const rows = mergeCoverage([{ row: 5, verdict: 'FAIL', note: 'x', slice: 'inj' }], opts([], [5]));
    expect(rows.find((r) => r.row === 5)?.verdict).toBe('WARNING');
  });

  it('says why a row was not tested', () => {
    const rows = mergeCoverage([], opts([], [10]));
    expect(rows).toHaveLength(Object.keys(COVERAGE_ROWS).length);
    expect(rows.find((r) => r.row === 9)?.note).toContain('deployed host');
    expect(rows.find((r) => r.row === 10)?.note).toContain('no verdict');
    expect(rows.find((r) => r.row === 14)?.note).toContain('no slice covered it');
  });

  it('renders a table that escapes pipes', () => {
    const md = renderCoverage(mergeCoverage([{ row: 1, verdict: 'PASS', note: 'a | b', slice: 'c' }], opts([], [1])), ['config']);
    expect(md).toContain('| 1 | Architecture, secrets, configuration | ✅ PASS | a \\| b |');
    expect(md).toContain('Specialists this run: config');
  });
});
