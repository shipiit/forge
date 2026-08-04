import { describe, it, expect } from 'vitest';
import { renderScanReport, blocking } from '../../src/scan/report.js';

const f = (over: Record<string, unknown> = {}) =>
  ({
    file: 'src/config.py',
    startLine: 41,
    endLine: 41,
    lens: 'security',
    severity: 'critical',
    category: 'CWE-798',
    title: 'GitHub personal access token committed to the repository',
    body: 'A value matching a github personal access token is in the source.',
    ...over,
  }) as never;

const opts = { displayName: 'ShipIT Forge', scope: 'the repository', filesScanned: 214 };

describe('what blocks a merge', () => {
  it('is critical and high, and nothing else', () => {
    const all = [f(), f({ severity: 'high' }), f({ severity: 'medium' }), f({ severity: 'low' })];
    expect(blocking(all).map((x) => x.severity)).toEqual(['critical', 'high']);
  });
});

describe('a clean scan', () => {
  it('says so plainly and does not pad', () => {
    const body = renderScanReport([], opts);
    expect(body).toContain('Nothing found');
    expect(body).toContain('214 files');
    expect(body).not.toContain('Rules detected');
  });
});

describe('the report', () => {
  it('leads with what has to be resolved before merging', () => {
    const body = renderScanReport([f(), f({ severity: 'medium', file: 'Dockerfile', title: 'Container runs as root' })], opts);
    expect(body).toContain('1 finding to resolve before merging');
    expect(body).toContain('🔴 Critical: **1**');
    expect(body).toContain('🟡 Medium: **1**');
  });

  it('says nothing is blocking when nothing is', () => {
    const body = renderScanReport([f({ severity: 'low' })], opts);
    expect(body).toContain('none of them blocking');
  });

  it('groups by rule, so fifty of one mistake read as one', () => {
    const many = Array.from({ length: 50 }, (_, i) => f({ file: `src/f${i}.py` }));
    const body = renderScanReport(many, opts);
    const rows = body.split('\n').filter((l) => l.startsWith('| GitHub personal'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('| 50 |');
    expect(rows[0]).toContain('50 |');
  });

  it('names every location, because "somewhere" is not actionable', () => {
    const body = renderScanReport([f(), f({ endLine: 88, severity: 'high' })], opts);
    expect(body).toContain('<code>src/config.py</code> — 2 findings');
    expect(body).toContain('line 41');
    expect(body).toContain('line 88');
  });

  it('links straight to the line when it knows the ref', () => {
    const body = renderScanReport([f()], { ...opts, repoUrl: 'https://github.com/o/r', ref: 'main' });
    expect(body).toContain('(https://github.com/o/r/blob/main/src/config.py#L41)');
  });

  it('never prints the secret, and says rotation is the fix', () => {
    const body = renderScanReport([f()], opts);
    expect(body).not.toContain('ghp_');
    expect(body).toContain('treated as compromised');
    expect(body).toContain('rotating it is the fix');
  });

  it('tells the reader how to dismiss one', () => {
    expect(renderScanReport([f()], opts)).toContain('forge-ignore: secrets');
  });
});

describe('what stops a merge is a setting', () => {
  const f = (severity: string) =>
    ({ file: 'a.ts', startLine: 1, endLine: 1, lens: 'security', severity, category: 'CWE-1', title: 'T', body: 'b' } as never);

  it('blocks on high and above by default', () => {
    expect(blocking([f('critical'), f('high'), f('medium'), f('low')])).toHaveLength(2);
  });

  it('can be told nothing outstanding may merge', () => {
    // The repository that wants every finding resolved or dismissed first.
    expect(blocking([f('critical'), f('high'), f('medium'), f('low')], 'low')).toHaveLength(4);
  });

  it('can be a report with no gate at all', () => {
    expect(blocking([f('critical')], 'none')).toHaveLength(0);
  });

  it('says which threshold is in force, so nobody has to guess', () => {
    const strict = renderScanReport([f('medium')], {
      displayName: 'Forge',
      scope: 'this pull request',
      filesScanned: 1,
      blockAt: 'low',
    });
    expect(strict).toContain('Blocking at **low**');
    expect(strict).toContain('resolved or dismissed');
    expect(renderScanReport([f('medium')], {
      displayName: 'Forge',
      scope: 'this pull request',
      filesScanned: 1,
      blockAt: 'none',
    })).toContain('runs the scan as a report');
  });
});

describe('saying what was looked for', () => {
  it('lists the coverage of the scanners that ran, on a clean report too', () => {
    const clean = renderScanReport([], {
      displayName: 'Forge',
      scope: 'this pull request',
      filesScanned: 9,
      scanners: ['secrets', 'code'],
    });
    expect(clean).toContain('What this scan looked for');
    expect(clean).toContain('Committed credentials');
    expect(clean).toContain('Source code');
    // Not claiming a pass that did not run.
    expect(clean).not.toContain('Infrastructure and workflows');
  });
});

describe('a fixture never holds the gate shut', () => {
  const at = (file: string, severity: string) =>
    ({ file, startLine: 1, endLine: 1, lens: 'security', severity, category: 'CWE-1', title: 'T', body: 'b' } as never);

  it('does not block on a test file even at the strictest threshold', () => {
    // "Nothing outstanding merges" must not mean "your own test suite blocks
    // you forever" — that is how a scanner gets switched off.
    const findings = [at('tests/scan/code.test.ts', 'low'), at('src/api.ts', 'low')];
    expect(blocking(findings, 'low').map((f) => f.file)).toEqual(['src/api.ts']);
  });

  it('does not block on one even if a rule called it critical', () => {
    expect(blocking([at('tests/a.test.ts', 'critical')], 'high')).toHaveLength(0);
  });

  it('still reports it, because a key in a test is still a key', () => {
    const body = renderScanReport([at('tests/a.test.ts', 'low')], {
      displayName: 'Forge',
      scope: 'this pull request',
      filesScanned: 1,
      blockAt: 'low',
    });
    expect(body).toContain('tests/a.test.ts');
    expect(body).toContain('none of them blocking');
  });
});
