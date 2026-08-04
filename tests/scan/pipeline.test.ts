import { describe, it, expect } from 'vitest';
import { scannersFor, SCANNERS, mergeFindings, inTestFile } from '../../src/scan/index.js';

describe('what the pipeline actually is', () => {
  it('is three scanners, and the docs have to match', () => {
    // A diagram claiming a dependency/SCA pass would be advertising something
    // that does not exist. This fails the day the list changes, which is the
    // point — the README and the diagram have to move with it.
    expect(SCANNERS.map((s) => s.name)).toEqual(['secrets', 'iac', 'code']);
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

describe('choosing which scanners run', () => {
  it('runs everything by default', () => {
    expect(scannersFor({ secretScan: true, codeScan: true }).map((s) => s.name)).toEqual([
      'secrets',
      'iac',
      'code',
    ]);
  });

  it('drops the code rules when only credentials are wanted', () => {
    expect(scannersFor({ secretScan: true, codeScan: false }).map((s) => s.name)).toEqual(['secrets', 'iac']);
  });

  it('keeps the configuration rules when only code scanning is on', () => {
    // A repository that switched off the credential scan still wants to know
    // its workflow hands a write token to everything it runs.
    expect(scannersFor({ secretScan: false, codeScan: true }).map((s) => s.name)).toEqual(['iac', 'code']);
  });

  it('runs nothing when both are off', () => {
    expect(scannersFor({ secretScan: false, codeScan: false })).toHaveLength(0);
  });
});

describe('a test fixture is not a review comment', () => {
  it('recognises the shapes tests actually have', () => {
    for (const p of [
      'tests/scan/code.test.ts',
      'src/scan/__tests__/a.ts',
      'src/a.spec.tsx',
      'pkg/handler_test.go',
      'app/test_views.py',
      'spec/models/user.rb',
    ]) {
      expect(inTestFile({ file: p })).toBe(true);
    }
  });

  it('does not mistake shipped code for a fixture', () => {
    for (const p of ['src/scan/code.ts', 'src/contest.ts', 'lib/latest.js', 'src/specification.ts']) {
      expect(inTestFile({ file: p })).toBe(false);
    }
  });
});
