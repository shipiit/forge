import { describe, it, expect } from 'vitest';
import { SCANNERS, mergeFindings } from '../../src/scan/index.js';

describe('what the pipeline actually is', () => {
  it('is two scanners, not four', () => {
    // A diagram claiming a dependency/SCA pass and a separate config scanner
    // would be advertising something that does not exist. Two: secrets and
    // infrastructure. This test fails the day that stops being true, which is
    // the point — the docs and the diagram have to move with it.
    expect(SCANNERS.map((s) => s.name)).toEqual(['secrets', 'iac']);
  });

  it('keeps one comment when the model and a scanner find the same thing', () => {
    const same = {
      file: 'src/a.ts',
      startLine: 3,
      endLine: 3,
      lens: 'security',
      category: 'CWE-798',
      title: 'Key committed',
    };
    const merged = mergeFindings(
      [{ ...same, severity: 'high', body: 'The model explained it at length, with the call path.' } as never],
      [{ ...same, severity: 'critical', body: 'Short.' } as never],
    );
    expect(merged).toHaveLength(1);
    // The more severe verdict wins, and the fuller explanation survives.
    expect(merged[0]!.severity).toBe('critical');
    expect(merged[0]!.body).toContain('call path');
  });
});

describe('what the model is told about the scan', () => {
  const find = (i: number) =>
    ({
      file: `src/f${i}.ts`,
      startLine: 1,
      endLine: 1,
      lens: 'security',
      severity: 'high',
      category: 'CWE-798',
      title: `Key ${i} committed`,
      body: 'Matched: `ghp_a1B2c3D4` (40 chars)',
    }) as never;

  it('sends titles and locations, never the body that quotes the match', async () => {
    const { scanSummary } = await import('../../src/github/handlers.js');
    const text = scanSummary([find(1)]).text;
    expect(text).toContain('src/f1.ts:1');
    expect(text).toContain('Key 1 committed');
    // The body quotes the first characters of the secret. It has no business
    // in a prompt when the title already says what was found.
    expect(text).not.toContain('ghp_');
  });

  it('caps the list, so a thousand findings do not become the first turn', async () => {
    const { scanSummary } = await import('../../src/github/handlers.js');
    const text = scanSummary(Array.from({ length: 500 }, (_, i) => find(i))).text;
    expect(text.split('\n').length).toBeLessThan(45);
    expect(text).toContain('460 more');
  });
});
