import { describe, it, expect, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { handlePrReview, handleScan, type HandlerDeps } from '../../src/github/handlers.js';
import type { WorkspacePort, Workspace } from '../../src/github/workspace.js';
import type { OctokitLike } from '../../src/github/pr.js';
import type { Scanner } from '../../src/scan/index.js';
import { FakeLLMClient } from '../../src/providers/fake.js';

/**
 * The dependency pass reports what a pull request introduced only if it is told
 * what the pull request is compared against. Without the base it silently
 * judges the whole lockfile, so every path that scans a pull request has to
 * hand it over.
 */

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});

const port: WorkspacePort = {
  async clone() {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-base-'));
    dirs.push(dir);
    await fs.writeFile(path.join(dir, 'package-lock.json'), '{}');
    return { dir, git: {} as never, cleanup: async () => {} } as Workspace;
  },
  async createBranch() {},
  async commitAll() { return false; },
  async pushBranch() {},
  async diffHead() { return ''; },
  async commitSubjects() { return ''; },
};

/** A scanner that only records the base it was given. */
function recorder(): { scanner: Scanner; bases: Array<string | undefined> } {
  const bases: Array<string | undefined> = [];
  return {
    bases,
    scanner: {
      name: 'deps',
      handles: () => true,
      scan: (_f, ctx) => {
        bases.push(ctx.base);
        return [];
      },
    },
  };
}

function octokit(get: () => Promise<unknown>): OctokitLike {
  return {
    rest: {
      issues: {
        async createComment() { return { data: { id: 1, html_url: 'u' } }; },
        async updateComment() { return { data: { html_url: 'u' } }; },
        async listComments() { return { data: [] }; },
      },
      pulls: { get, async createReview() {}, async list() { return { data: [] }; } },
      checks: { async create() { return { data: {} }; } },
    },
    async request() {
      return { data: 'diff --git a/package-lock.json b/package-lock.json\n@@ -1 +1 @@\n-{ }\n+{}\n' };
    },
  } as unknown as OctokitLike;
}

const pr = { title: 'PR', body: '', head: { ref: 'feature', sha: 'headsha' }, base: { ref: 'main', sha: 'basesha' } };
const reply = { text: '[]', toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 }, stopReason: 'end' as const };
const deps = (o: OctokitLike, scanner: Scanner): HandlerDeps =>
  ({ octokit: o, client: new FakeLLMClient([reply, reply]), token: 't', log: () => {}, workspace: port, scanners: [scanner] }) as unknown as HandlerDeps;

describe('the base commit reaches the scanners', () => {
  it('on the scan that runs with every push', async () => {
    const { scanner, bases } = recorder();
    await handleScan(deps(octokit(async () => ({ data: pr })), scanner), {
      owner: 'o', repo: 'r', issueNumber: 5, pullNumber: 5, ref: 'feature', baseSha: 'fromevent',
    });
    expect(bases).toEqual(['fromevent']);
  });

  it('on a /secrets comment, which carries no base, by asking for the pull request', async () => {
    const { scanner, bases } = recorder();
    await handleScan(deps(octokit(async () => ({ data: pr })), scanner), { owner: 'o', repo: 'r', issueNumber: 5, pullNumber: 5, ref: 'feature' });
    expect(bases).toEqual(['basesha']);
  });

  it('does not scan, or pass a check, when the pull request cannot be read', async () => {
    const { scanner, bases } = recorder();
    const checks: unknown[] = [];
    const failing = octokit(async () => {
      throw new Error('404');
    });
    failing.rest.checks.create = async (p) => {
      checks.push(p);
      return { data: {} };
    };
    await handleScan(deps(failing, scanner), { owner: 'o', repo: 'r', issueNumber: 5, pullNumber: 5, ref: 'main' });
    expect(bases).toEqual([]);
    expect(checks).toEqual([]);
  });

  it('does not ask for a base on a scan that is not of a pull request', async () => {
    const { scanner, bases } = recorder();
    let asked = 0;
    await handleScan(deps(octokit(async () => { asked++; return { data: pr }; }), scanner), { owner: 'o', repo: 'r', issueNumber: 5, ref: 'main' });
    expect(asked).toBe(0);
    expect(bases).toEqual([undefined]);
  });

  it('on a pull-request review', async () => {
    const { scanner, bases } = recorder();
    await handlePrReview(deps(octokit(async () => ({ data: pr })), scanner), { owner: 'o', repo: 'r', pullNumber: 5 });
    expect(bases).toEqual(['basesha']);
  });
});
