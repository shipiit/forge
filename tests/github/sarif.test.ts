import { describe, it, expect } from 'vitest';
import { parseSarif } from '../../src/github/sarif.js';

const sarif = JSON.stringify({
  runs: [
    {
      tool: {
        driver: {
          name: 'CodeQL',
          rules: [
            { id: 'js/ssrf', name: 'Server-side request forgery', properties: { 'security-severity': '9.1' }, fullDescription: { text: 'SSRF detail' } },
            { id: 'js/unused', name: 'Unused variable', properties: { 'security-severity': '2.0' } },
          ],
        },
      },
      results: [
        {
          ruleId: 'js/ssrf',
          level: 'error',
          message: { text: 'The URL depends on user input.' },
          locations: [{ physicalLocation: { artifactLocation: { uri: 'src/api.js' }, region: { startLine: 68, endLine: 71 } } }],
        },
        {
          ruleId: 'js/unused',
          level: 'note',
          message: { text: 'x is unused.' },
          locations: [{ physicalLocation: { artifactLocation: { uri: 'src/util.js' }, region: { startLine: 10 } } }],
        },
      ],
    },
  ],
});

describe('parseSarif', () => {
  it('maps CodeQL results to findings with security-severity → severity', () => {
    const findings = parseSarif(sarif);
    expect(findings).toHaveLength(2);
    const ssrf = findings[0];
    expect(ssrf).toMatchObject({ file: 'src/api.js', startLine: 68, endLine: 71, lens: 'security', severity: 'critical' });
    expect(ssrf.category).toBe('CodeQL: js/ssrf');
    expect(ssrf.title).toBe('Server-side request forgery');
    expect(ssrf.body).toContain('user input');
  });

  it('uses security-severity to downgrade a low finding', () => {
    expect(parseSarif(sarif)[1]).toMatchObject({ severity: 'low', file: 'src/util.js', startLine: 10, endLine: 10 });
  });

  it('falls back to level when security-severity is absent', () => {
    const doc = JSON.stringify({
      runs: [{ tool: { driver: { name: 'Semgrep', rules: [] } }, results: [
        { ruleId: 'r1', level: 'warning', message: { text: 'm' }, locations: [{ physicalLocation: { artifactLocation: { uri: 'a' }, region: { startLine: 3 } } }] },
      ] }],
    });
    expect(parseSarif(doc)[0]).toMatchObject({ severity: 'medium', category: 'Semgrep: r1' });
  });

  it('returns [] for malformed or empty input', () => {
    expect(parseSarif('not json')).toEqual([]);
    expect(parseSarif('{}')).toEqual([]);
    expect(parseSarif(JSON.stringify({ runs: [{ results: [{ ruleId: 'x' }] }] }))).toEqual([]); // no location → skipped
  });
});
