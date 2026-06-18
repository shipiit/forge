import { describe, it, expect } from 'vitest';
import { mapAlertsToFindings, fetchDependabotFindings } from '../../src/github/dependabot.js';

const alert = {
  state: 'open',
  html_url: 'https://github.com/o/r/security/dependabot/1',
  dependency: { package: { ecosystem: 'npm', name: 'lodash' }, manifest_path: 'package.json' },
  security_advisory: { ghsa_id: 'GHSA-xxxx', cve_id: 'CVE-2021-23337', summary: 'Command injection in lodash', severity: 'high' },
  security_vulnerability: { vulnerable_version_range: '< 4.17.21', first_patched_version: { identifier: '4.17.21' } },
};

describe('mapAlertsToFindings', () => {
  it('maps an open Dependabot alert to a finding', () => {
    const [f] = mapAlertsToFindings([alert]);
    expect(f).toMatchObject({ lens: 'security', severity: 'high', file: 'package.json', category: 'Dependabot: CVE-2021-23337' });
    expect(f.title).toContain('lodash');
    expect(f.body).toContain('4.17.21');
  });

  it('skips non-open alerts and defaults unknown severity to medium', () => {
    expect(mapAlertsToFindings([{ ...alert, state: 'fixed' }])).toHaveLength(0);
    const [f] = mapAlertsToFindings([{ ...alert, security_advisory: { ...alert.security_advisory, severity: 'weird' } }]);
    expect(f.severity).toBe('medium');
  });
});

describe('fetchDependabotFindings', () => {
  it('returns [] (no throw) when the endpoint errors or is absent', async () => {
    const octokit: any = { rest: {} };
    expect(await fetchDependabotFindings(octokit, 'o', 'r')).toEqual([]);
    const erroring: any = { rest: { dependabot: { listAlertsForRepo: async () => { throw new Error('403'); } } } };
    expect(await fetchDependabotFindings(erroring, 'o', 'r')).toEqual([]);
  });

  it('returns findings when alerts are available', async () => {
    const octokit: any = { rest: { dependabot: { listAlertsForRepo: async () => ({ data: [alert] }) } } };
    const findings = await fetchDependabotFindings(octokit, 'o', 'r');
    expect(findings).toHaveLength(1);
  });
});
