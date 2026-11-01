import { describe, it, expect } from 'vitest';
import type { AgentResult } from '../../src/agent/loop.js';
import { runAudit } from '../../src/audit/run.js';
import { applicableSlices } from '../../src/audit/select.js';
import { BUILT_IN_SLICES, type AuditSlice } from '../../src/audit/slices.js';

const result = (finalText: string): AgentResult => ({ finalText, iterations: 1, stoppedBy: 'end', messages: [], usage: { inputTokens: 1, outputTokens: 1 } });
const slice = (id: string, rows: number[]): AuditSlice => ({ id, title: id, rows, needs: 'always', prompt: id });
const finding = (title: string, line: number) => ({ file: 'app.py', startLine: line, endLine: line, lens: 'security', severity: 'high', category: 'CWE-89', title, body: 'b' });
const envelope = (findings: unknown[], coverage: unknown[]) => JSON.stringify({ findings, coverage, checked: [], notTested: [] });

describe('runAudit', () => {
  it('runs each slice, merges duplicates across slices, verifies once, and maps coverage', async () => {
    const seen: string[] = [];
    const verified: string[] = [];
    const out = await runAudit({
      slices: [slice('inj', [5]), slice('access', [4])],
      log: () => {},
      find: async (s) => {
        seen.push(s.id);
        return s.id === 'inj'
          ? result(envelope([finding('real', 3), finding('imagined', 9)], [{ row: 5, verdict: 'FAIL', note: 'app.py:3' }]))
          : result(envelope([finding('real', 3)], [{ row: 4, verdict: 'FAIL', note: 'thought so' }, { row: 5, verdict: 'PASS', note: 'outside my slice' }]));
      },
      verify: async (c) => {
        verified.push(c);
        return result('[{"id":1,"verdict":"rejected","reason":"guarded"}]');
      },
    });
    expect(seen.sort()).toEqual(['access', 'inj']);
    expect(JSON.parse(verified[0]!)).toHaveLength(2);
    expect(out.findings.map((f) => f.title)).toEqual(['real']);
    expect(out.verified).toBe(true);
    const row = (n: number) => out.coverage.find((c) => c.row === n);
    // Both slices reported the confirmed finding, so both stand behind their FAIL.
    expect(row(5)?.verdict).toBe('FAIL');
    expect(row(4)?.verdict).toBe('FAIL');
    expect(out.results).toHaveLength(3);
  });

  it('ignores a verdict for a row outside the slice', async () => {
    const out = await runAudit({
      slices: [slice('access', [4])],
      log: () => {},
      find: async () => result(envelope([], [{ row: 10, verdict: 'PASS', note: 'not mine' }])),
      verify: async () => result('[]'),
    });
    expect(out.coverage.find((c) => c.row === 10)?.verdict).toBe('NOT TESTED');
  });

  it('carries on without a failed slice, and says so', async () => {
    const logs: string[] = [];
    const out = await runAudit({
      slices: [slice('a', [1]), slice('b', [2])],
      log: (m) => logs.push(m),
      find: async (s) => {
        if (s.id === 'b') throw new Error('rate limited');
        return result(envelope([], [{ row: 1, verdict: 'PASS', note: 'ok' }]));
      },
      verify: async () => result('[]'),
    });
    expect(out).toMatchObject({ ran: ['a'], failed: ['b'] });
    expect(logs.join()).toContain('b failed');
  });

  it('throws when every slice failed, rather than report a clean audit', async () => {
    await expect(
      runAudit({ slices: [slice('a', [1])], log: () => {}, find: async () => { throw new Error('down'); }, verify: async () => result('[]') }),
    ).rejects.toThrow('every audit specialist failed');
  });

  it('keeps every candidate, marked unverified, when the verifier fails', async () => {
    const out = await runAudit({
      slices: [slice('inj', [5])],
      log: () => {},
      find: async () => result(envelope([finding('x', 3)], [{ row: 5, verdict: 'FAIL', note: '' }])),
      verify: async () => { throw new Error('budget'); },
    });
    expect(out).toMatchObject({ verified: false });
    expect(out.findings).toHaveLength(1);
    expect(out.coverage.find((c) => c.row === 5)?.verdict).toBe('FAIL');
  });

  it('never runs more slices at once than allowed', async () => {
    let live = 0;
    let peak = 0;
    await runAudit({
      slices: Array.from({ length: 7 }, (_, i) => slice(`s${i}`, [1])),
      concurrency: 2,
      log: () => {},
      find: async () => {
        peak = Math.max(peak, ++live);
        await new Promise((r) => setTimeout(r, 5));
        live--;
        return result(envelope([], []));
      },
      verify: async () => result('[]'),
    });
    expect(peak).toBe(2);
  });
});

describe('applicableSlices', () => {
  const read = (files: Record<string, string>) => async (p: string) => files[p];

  it('skips the frontend and LLM specialists when there is nothing for them', async () => {
    const { run, skipped } = await applicableSlices(BUILT_IN_SLICES, ['app.py', 'requirements.txt', 'tests/page.html'], read({ 'requirements.txt': 'django==5' }));
    expect(run.map((s) => s.id)).not.toContain('frontend');
    expect(run.map((s) => s.id)).not.toContain('ai');
    expect(skipped.map((s) => s.slice.id).sort()).toEqual(['ai', 'frontend']);
  });

  it('runs them when the repository has a frontend and a model SDK', async () => {
    const { run } = await applicableSlices(BUILT_IN_SLICES, ['web/App.tsx', 'package.json'], read({ 'package.json': '{"dependencies":{"@anthropic-ai/sdk":"1"}}' }));
    expect(run).toHaveLength(BUILT_IN_SLICES.length);
  });
});
