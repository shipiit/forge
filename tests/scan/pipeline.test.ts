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
