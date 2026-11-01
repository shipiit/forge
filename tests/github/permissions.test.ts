import { describe, it, expect } from 'vitest';
import { hasWriteAccess, mayTrigger } from '../../src/github/permissions.js';
import type { OctokitLike } from '../../src/github/pr.js';

/** An Octokit whose only working call is the permission lookup. */
function octokitFor(level: Record<string, { permission?: string; role_name?: string } | Error>) {
  const asked: string[] = [];
  const octokit = {
    rest: {
      repos: {
        async getCollaboratorPermissionLevel(p: Record<string, unknown>) {
          const user = String(p.username);
          asked.push(user);
          const found = level[user];
          if (!found || found instanceof Error) throw found ?? new Error('Not Found');
          return { data: found };
        },
      },
    },
  } as unknown as OctokitLike;
  return { octokit, asked };
}

const payload = (login?: string) => ({ sender: login ? { login } : undefined, repository: { name: 'r', owner: { login: 'o' } } });

describe('who has write access', () => {
  const { octokit } = octokitFor({
    admin: { permission: 'admin', role_name: 'admin' },
    maintainer: { permission: 'write', role_name: 'maintain' },
    writer: { permission: 'write', role_name: 'write' },
    triager: { permission: 'read', role_name: 'triage' },
    reader: { permission: 'read', role_name: 'read' },
    outsider: { permission: 'none' },
    broken: new Error('Resource not accessible by integration'),
  });

  it.each([
    ['admin', true],
    ['maintainer', true],
    ['writer', true],
    ['triager', false],
    ['reader', false],
    ['outsider', false],
    ['broken', false],
    ['dependabot[bot]', false],
  ])('%s → %s', async (login, expected) => {
    expect(await hasWriteAccess(octokit, 'o', 'r', login)).toBe(expected);
  });

  it('refuses when nobody is named', async () => {
    expect(await hasWriteAccess(octokit, 'o', 'r', undefined)).toBe(false);
    expect(await hasWriteAccess(octokit, 'o', 'r', '')).toBe(false);
  });

  it('refuses when the permission API is not available at all', async () => {
    const bare = { rest: { repos: {} } } as unknown as OctokitLike;
    const logs: string[] = [];
    expect(await hasWriteAccess(bare, 'o', 'r', 'admin', (m) => logs.push(m))).toBe(false);
    expect(logs.join()).toContain('unavailable');
  });
});

describe('which events need it', () => {
  it.each(['issue_comment', 'pull_request_review_comment', 'issues'])('%s from a stranger does not run', async (event) => {
    const { octokit } = octokitFor({});
    const logs: string[] = [];
    expect(await mayTrigger(octokit, event, payload('stranger'), (m) => logs.push(m))).toBe(false);
    expect(logs.join()).toContain('only people with write access');
  });

  it.each(['issue_comment', 'issues'])('%s from a collaborator with write access runs', async (event) => {
    const { octokit } = octokitFor({ dev: { permission: 'write' } });
    expect(await mayTrigger(octokit, event, payload('dev'))).toBe(true);
  });

  it.each(['pull_request', 'push', 'schedule', 'release', 'check_suite', 'workflow_dispatch'])(
    '%s runs without asking, since nobody typed it',
    async (event) => {
      const { octokit, asked } = octokitFor({});
      expect(await mayTrigger(octokit, event, payload('stranger'))).toBe(true);
      expect(asked).toEqual([]);
    },
  );

  it.each([[undefined], [null], [{}], [{ sender: { login: 'dev' } }], [{ repository: { name: 'r' }, sender: { login: 'dev' } }]])(
    'refuses a comment whose payload does not say where it came from: %j',
    async (p) => {
      const { octokit } = octokitFor({ dev: { permission: 'admin' } });
      expect(await mayTrigger(octokit, 'issue_comment', p)).toBe(false);
    },
  );

  it('refuses a comment with no sender', async () => {
    const { octokit } = octokitFor({});
    expect(await mayTrigger(octokit, 'issue_comment', payload())).toBe(false);
  });
});
