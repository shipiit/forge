import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import {
  EXTERNAL_TOOLS, renderToolRuns, runExternalScanners, scannerEnv, type ExternalTool,
} from '../../src/scan/external/index.js';
import {
  parseBandit, parseCheckov, parseGitleaks, parseOsvScanner, parseSemgrep, parseTrivy, relPath,
} from '../../src/scan/external/parsers.js';

const ROOT = '/work/repo';

describe('paths from scanners', () => {
  it.each([
    ['/work/repo/src/a.py', 'src/a.py'],
    ['./src/a.py', 'src/a.py'],
    ['src\\a.py', 'src/a.py'],
    ['/work/repo/../etc/passwd', ''],
    ['../outside', ''],
  ])('%s → %j', (p, want) => expect(relPath(p, ROOT)).toBe(want));
});

describe('parsers', () => {
  it('semgrep: CWE from metadata, severity from level', () => {
    const [f] = parseSemgrep(
      { results: [{ check_id: 'python.lang.security.sqli.raw-query', path: `${ROOT}/app.py`, start: { line: 4 }, end: { line: 5 }, extra: { severity: 'ERROR', message: 'raw <b>SQL</b>', metadata: { cwe: ['CWE-89: SQL Injection'] } } }] },
      ROOT,
    );
    expect(f).toMatchObject({ file: 'app.py', startLine: 4, endLine: 5, severity: 'high', category: 'CWE-89' });
    expect(f!.body).not.toContain('<b>');
    expect(f!.body).toContain('Reported by semgrep');
  });

  it('gitleaks: CWE-798, so it merges with the built-in secret scanner', () => {
    expect(parseGitleaks([{ RuleID: 'aws-access-token', Description: 'AWS key', File: 'cfg/.env', StartLine: 2, EndLine: 2 }], ROOT)[0]).toMatchObject({
      file: 'cfg/.env', category: 'CWE-798', severity: 'high',
    });
  });

  it('trivy: misconfigurations and secrets, skipping passes', () => {
    const out = parseTrivy(
      {
        Results: [{
          Target: 'Dockerfile',
          Misconfigurations: [
            { ID: 'DS002', Title: 'Image user should not be root', Severity: 'HIGH', Status: 'FAIL', CauseMetadata: { StartLine: 1, EndLine: 1 } },
            { ID: 'DS001', Title: 'ok', Severity: 'LOW', Status: 'PASS' },
          ],
          Secrets: [{ RuleID: 'github-pat', Title: 'GitHub PAT', Severity: 'CRITICAL', StartLine: 9 }],
        }],
      },
      ROOT,
    );
    expect(out.map((f) => [f.category, f.severity])).toEqual([['trivy:DS002', 'high'], ['CWE-798', 'critical']]);
  });

  it('bandit: a low-confidence finding is downgraded', () => {
    const out = parseBandit(
      { results: [
        { filename: './a.py', line_number: 3, issue_severity: 'HIGH', issue_confidence: 'HIGH', issue_text: 'shell=True', test_id: 'B602', issue_cwe: { id: 78 } },
        { filename: './b.py', line_number: 1, issue_severity: 'HIGH', issue_confidence: 'LOW', issue_text: 'maybe', test_id: 'B105' },
      ] },
      ROOT,
    );
    expect(out.map((f) => [f.file, f.category, f.severity])).toEqual([['a.py', 'CWE-78', 'high'], ['b.py', 'bandit:B105', 'medium']]);
  });

  it('checkov: one block or many', () => {
    const block = { check_type: 'dockerfile', results: { failed_checks: [{ check_id: 'CKV_DOCKER_3', check_name: 'No USER', file_path: '/Dockerfile', file_line_range: [1, 12], severity: null }] } };
    expect(parseCheckov(block, ROOT)[0]).toMatchObject({ file: 'Dockerfile', startLine: 1, endLine: 12, severity: 'medium', category: 'checkov:CKV_DOCKER_3' });
    expect(parseCheckov([block, block], ROOT)).toHaveLength(2);
  });

  it('osv-scanner: only ecosystems the built-in scanner does not cover; MAL- is critical', () => {
    const out = parseOsvScanner(
      { results: [{ source: { path: `${ROOT}/go.sum` }, packages: [
        { package: { name: 'golang.org/x/net', version: '0.1.0', ecosystem: 'Go' }, vulnerabilities: [{ id: 'GO-2023-1' }], groups: [{ ids: ['GO-2023-1'], max_severity: '7.5' }] },
        { package: { name: 'evil', version: '1.0.0', ecosystem: 'Go' }, vulnerabilities: [{ id: 'MAL-2026-1' }], groups: [] },
        { package: { name: 'lodash', version: '4.17.15', ecosystem: 'npm' }, vulnerabilities: [{ id: 'GHSA-x' }], groups: [] },
        { package: { name: 'clean', version: '1.0.0', ecosystem: 'Go' }, vulnerabilities: [] },
      ] }] },
      ROOT,
    );
    expect(out.map((f) => [f.title, f.severity, f.category])).toEqual([
      ['Vulnerable dependency: golang.org/x/net@0.1.0 (Go)', 'high', 'CWE-1395'],
      ['Malicious package: evil@1.0.0 (Go)', 'critical', 'CWE-506'],
    ]);
  });

  it.each([parseSemgrep, parseGitleaks, parseTrivy, parseBandit, parseCheckov, parseOsvScanner])('%o survives garbage', (parse) => {
    for (const junk of [null, undefined, 42, 'x', [], {}, [null], { results: [null, 1] }, { Results: 'no' }]) {
      expect(() => parse(junk, ROOT)).not.toThrow();
    }
  });
});

describe('running the scanners', () => {
  const tool = (name: string, output: ExternalTool['output'] = 'file'): ExternalTool => ({
    name, output, args: (_c, out) => [out], parse: (json) => (Array.isArray(json) ? json.map(() => ({ file: 'a', startLine: 1, endLine: 1, lens: 'security' as const, severity: 'low' as const, category: name, title: name, body: '' })) : []),
  });

  it('reports what ran, what was missing and what failed, and never throws', async () => {
    const { findings, runs } = await runExternalScanners(ROOT, {
      tools: [tool('wrote'), tool('printed', 'stdout'), tool('absent'), tool('crashed'), tool('garbled', 'stdout')],
      exec: async (cmd, args) => {
        if (cmd === 'wrote') await fs.writeFile(args[0]!, '[1,2]');
        if (cmd === 'absent') throw Object.assign(new Error('spawn absent ENOENT'), { code: 'ENOENT' });
        if (cmd === 'crashed') throw new Error('exit 2\nstack');
        return cmd === 'printed' ? '[1]' : cmd === 'garbled' ? '{nope' : '';
      },
    });
    expect(findings).toHaveLength(3);
    expect(runs.map((r) => [r.name, r.status, r.findings])).toEqual([
      ['wrote', 'ran', 2], ['printed', 'ran', 1], ['absent', 'missing', 0], ['crashed', 'failed', 0], ['garbled', 'failed', 0],
    ]);
    expect(runs[3]!.detail).toBe('exit 2');
  });

  it('treats a binary that is not installed as missing, with the real runner', async () => {
    const { runs } = await runExternalScanners(process.cwd(), { tools: [tool('forge-definitely-not-installed-xyz')] });
    expect(runs[0]!.status).toBe('missing');
  });

  it('gives scanners no token or model key', () => {
    const env = scannerEnv({ PATH: '/bin', HOME: '/h', GITHUB_TOKEN: 'ghs_x', ANTHROPIC_API_KEY: 'sk', AWS_SECRET_ACCESS_KEY: 's', INPUT_GITHUB_TOKEN: 't' });
    expect(Object.keys(env).sort()).toEqual(['HOME', 'PATH', 'SEMGREP_ENABLE_VERSION_CHECK', 'SEMGREP_SEND_METRICS', 'TRIVY_DISABLE_VEX_NOTICE']);
  });

  it('runs the six tools without a shell, with the repository as the target', () => {
    expect(EXTERNAL_TOOLS.map((t) => t.name)).toEqual(['semgrep', 'gitleaks', 'trivy', 'osv-scanner', 'bandit', 'checkov']);
    for (const t of EXTERNAL_TOOLS) expect(t.args(ROOT, '/tmp/o.json').join(' ')).toContain(ROOT);
  });

  it('renders the run table, or nothing', () => {
    expect(renderToolRuns([])).toBe('');
    const md = renderToolRuns([{ name: 'semgrep', status: 'ran', findings: 3 }, { name: 'checkov', status: 'missing', findings: 0 }]);
    expect(md).toContain('1 of 2 ran');
    expect(md).toContain('| checkov | ➖ not installed |');
  });
});
