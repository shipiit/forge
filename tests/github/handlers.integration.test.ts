import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { handleIssueFix, handlePrReview, type HandlerDeps } from '../../src/github/handlers.js';
import type { WorkspacePort, Workspace } from '../../src/github/workspace.js';
import { FakeLLMClient } from '../../src/providers/fake.js';
import type { ChatResult } from '../../src/providers/types.js';
import type { OctokitLike } from '../../src/github/pr.js';

const usage = { inputTokens: 1, outputTokens: 1 };

/** A fake workspace backed by a real temp dir (so the agent's file tools work) but no git/network. */
function fakeWorkspace(seed: Record<string, string>): { port: WorkspacePort; pushed: string[]; cleanup: () => Promise<void> } {
  const pushed: string[] = [];
  let dir = '';
  const port: WorkspacePort = {
    async clone() {
      dir = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-int-'));
      for (const [p, content] of Object.entries(seed)) {
        await fs.mkdir(path.dirname(path.join(dir, p)), { recursive: true });
        await fs.writeFile(path.join(dir, p), content);
      }
      return { dir, git: {} as never, cleanup: async () => {} } as Workspace;
    },
    async createBranch() {},
    async commitAll() {
      return true; // pretend something changed
    },
    async pushBranch(_ws, branch) {
      pushed.push(branch);
    },
    async diffHead() {
      return 'diff --git a/sum.js b/sum.js\n@@ -1 +1 @@\n-export const add=(a,b)=>a-b;\n+export const add=(a,b)=>a+b;\n';
    },
  };
  return { port, pushed, cleanup: async () => dir && fs.rm(dir, { recursive: true, force: true }) };
}

/** A recording fake Octokit. */
function fakeOctokit(overrides: Partial<Record<string, unknown>> = {}) {
  const calls: { comments: any[]; updates: any[]; reviews: any[]; prs: any[] } = { comments: [], updates: [], reviews: [], prs: [] };
  let commentId = 0;
  const octokit = {
    rest: {
      issues: {
        async createComment(p: any) { calls.comments.push(p); return { data: { id: ++commentId } }; },
        async updateComment(p: any) { calls.updates.push(p); },
        async listComments() { return { data: [] }; },
      },
      pulls: {
        async list() { return { data: (overrides.openPrs as any[]) ?? [] }; },
        async create(p: any) { calls.prs.push(p); return { data: { number: 42, html_url: 'https://github.com/o/r/pull/42' } }; },
        async createReview(p: any) { calls.reviews.push(p); },
        async get() { return { data: { title: 'PR', body: 'desc', head: { ref: 'feature', sha: 'abc' }, base: { ref: 'main' } } }; },
      },
    },
    async request() { return { data: (overrides.diff as string) ?? '' }; },
  } as unknown as OctokitLike;
  return { octokit, calls };
}

let cleanups: Array<() => Promise<void>> = [];
beforeEach(() => { cleanups = []; });
afterEach(async () => { for (const c of cleanups) await c(); });

describe('handleIssueFix (integration)', () => {
  it('investigates, opens a PR, and comments', async () => {
    const ws = fakeWorkspace({ 'sum.js': 'export const add=(a,b)=>a-b;\n' });
    cleanups.push(ws.cleanup);
    const { octokit, calls } = fakeOctokit();

    // Fake model: edit the file, then finish.
    const script: ChatResult[] = [
      { text: '', toolCalls: [{ id: '1', name: 'write_file', args: { path: 'sum.js', content: 'export const add=(a,b)=>a+b;\n' } }], usage, stopReason: 'tool_use' },
      { text: 'Fixed the add function.', toolCalls: [], usage, stopReason: 'end' },
    ];
    const deps: HandlerDeps = {
      octokit,
      client: new FakeLLMClient(script),
      token: 'x-access-token:fake',
      log: () => {},
      workspace: ws.port,
    };

    await handleIssueFix(deps, { owner: 'o', repo: 'r', defaultBranch: 'main', issueNumber: 7, issueTitle: 'add is wrong', issueBody: 'subtracts instead of adds' });

    // One ack comment, then edited in place with the result (no spam)
    expect(calls.comments.length).toBe(1);
    expect(calls.comments[0].body).toMatch(/working on a fix/i);
    expect(calls.updates.length).toBe(1);
    expect(calls.updates[0].body).toMatch(/fix ready|What I found/i);
    // PR opened with the right branch and base
    expect(calls.prs).toHaveLength(1);
    expect(calls.prs[0]).toMatchObject({ head: 'forge/issue-7', base: 'main' });
    expect(calls.prs[0].body).toMatch(/Closes #7/);
    expect(ws.pushed).toEqual(['forge/issue-7']);
  });

  it('runs a self-review pass and opens a draft PR when it flags a blocker', async () => {
    const ws = fakeWorkspace({ 'sum.js': 'export const add=(a,b)=>a-b;\n' });
    cleanups.push(ws.cleanup);
    const { octokit, calls } = fakeOctokit();

    const selfFinding = JSON.stringify([
      { file: 'sum.js', startLine: 1, endLine: 1, lens: 'quality', severity: 'high', category: 'bug', title: 'Edge case not handled', body: 'x' },
    ]);
    const script: ChatResult[] = [
      // fix pass
      { text: '', toolCalls: [{ id: '1', name: 'write_file', args: { path: 'sum.js', content: 'export const add=(a,b)=>a+b;\n' } }], usage, stopReason: 'tool_use' },
      { text: 'Fixed.', toolCalls: [], usage, stopReason: 'end' },
      // self-review pass returns a HIGH finding
      { text: selfFinding, toolCalls: [], usage, stopReason: 'end' },
    ];
    const deps: HandlerDeps = {
      octokit,
      client: new FakeLLMClient(script),
      token: 't',
      log: () => {},
      workspace: ws.port,
      selfReview: true,
    };

    await handleIssueFix(deps, { owner: 'o', repo: 'r', defaultBranch: 'main', issueNumber: 3, issueTitle: 'bug', issueBody: null });

    expect(calls.prs).toHaveLength(1);
    expect(calls.prs[0].draft).toBe(true); // blocker → draft
    expect(calls.prs[0].body).toMatch(/Automated review/);
    expect(calls.prs[0].body).toMatch(/Edge case not handled/);
  });

  it('is idempotent: skips when a fix PR is already open', async () => {
    const ws = fakeWorkspace({});
    cleanups.push(ws.cleanup);
    const { octokit, calls } = fakeOctokit({ openPrs: [{ number: 9, html_url: 'https://github.com/o/r/pull/9' }] });
    const deps: HandlerDeps = { octokit, client: new FakeLLMClient([]), token: 't', log: () => {}, workspace: ws.port };

    await handleIssueFix(deps, { owner: 'o', repo: 'r', defaultBranch: 'main', issueNumber: 9, issueTitle: 't', issueBody: null });

    expect(calls.prs).toHaveLength(0); // no new PR
    expect(ws.pushed).toEqual([]); // nothing pushed
  });
});

describe('handlePrReview (integration)', () => {
  it('posts a review with inline comments clamped to the diff', async () => {
    const ws = fakeWorkspace({ 'app.py': 'x\n'.repeat(80) });
    cleanups.push(ws.cleanup);
    const diff = ['--- a/app.py', '+++ b/app.py', '@@ -10,2 +10,3 @@', ' ctx', '+vuln_line', ' ctx2'].join('\n');
    const { octokit, calls } = fakeOctokit({ diff });

    // Model returns findings JSON: one in-diff (line 11), one out-of-diff (line 999).
    const findings = JSON.stringify([
      { file: 'app.py', startLine: 11, endLine: 11, lens: 'security', severity: 'critical', category: 'CWE-918 SSRF', title: 'SSRF', body: 'bad', suggestion: 'fix' },
      { file: 'app.py', startLine: 999, endLine: 999, lens: 'quality', severity: 'low', category: 'style', title: 'nit', body: 'x' },
    ]);
    const deps: HandlerDeps = {
      octokit,
      client: new FakeLLMClient([{ text: findings, toolCalls: [], usage, stopReason: 'end' }]),
      token: 't',
      log: () => {},
      workspace: ws.port,
    };

    await handlePrReview(deps, { owner: 'o', repo: 'r', pullNumber: 5 });

    expect(calls.reviews).toHaveLength(1);
    const review = calls.reviews[0];
    expect(review.event).toBe('REQUEST_CHANGES'); // critical finding present
    expect(review.comments).toHaveLength(1); // only the in-diff finding is inline
    expect(review.comments[0]).toMatchObject({ path: 'app.py', line: 11 });
    expect(review.body).toMatch(/outside the diff/); // out-of-diff finding moved to summary
  });
});
