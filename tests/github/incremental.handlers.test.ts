import { describe, it, expect, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { handlePrReview, type HandlerDeps } from '../../src/github/handlers.js';
import { reviewedMarker } from '../../src/github/incremental.js';
import type { Workspace, WorkspacePort } from '../../src/github/workspace.js';
import type { OctokitLike } from '../../src/github/pr.js';
import { FakeLLMClient } from '../../src/providers/fake.js';
import type { ChatResult } from '../../src/providers/types.js';

const OLD = 'a'.repeat(40);
const HEAD = 'b'.repeat(40);
const DIFF = [
  'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-x\n+A_CHANGED\n',
  'diff --git a/src/b.ts b/src/b.ts\n--- a/src/b.ts\n+++ b/src/b.ts\n@@ -1 +1 @@\n-p\n+B_CHANGED\n',
].join('');

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});

function setup(opts: { marker?: string; compare?: unknown | Error }) {
  let clones = 0;
  let compares = 0;
  let ack = '';
  const port: WorkspacePort = {
    async clone() {
      clones++;
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-inc-'));
      dirs.push(dir);
      return { dir, git: {} as never, cleanup: async () => {} } as Workspace;
    },
    async createBranch() {},
    async commitAll() { return false; },
    async pushBranch() {},
    async diffHead() { return ''; },
    async commitSubjects() { return ''; },
  };
  const octokit = {
    rest: {
      issues: {
        async createComment() { return { data: { id: 9 } }; },
        async updateComment(p: { body: string }) { ack = p.body; return { data: {} }; },
        async listComments() {
          return { data: opts.marker ? [{ id: 9, body: `<!-- forge-review -->\n\ndone\n\n${opts.marker}` }] : [] };
        },
      },
      pulls: {
        async get() { return { data: { title: 'PR', body: '', head: { ref: 'f', sha: HEAD, repo: { full_name: 'o/r' } }, base: { ref: 'main', sha: OLD } } }; },
        async createReview() {},
      },
    },
    async request(route: string) {
      if (route.includes('compare')) {
        compares++;
        if (opts.compare instanceof Error) throw opts.compare;
        return { data: opts.compare };
      }
      return { data: DIFF };
    },
  } as unknown as OctokitLike;
  const reply: ChatResult = { text: '[]', toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 }, stopReason: 'end' };
  const client = new FakeLLMClient([reply, reply]);
  const deps = { octokit, client, token: 't', log: () => {}, workspace: port, scanners: [], reviewDepth: 'light' } as unknown as HandlerDeps;
  return { deps, client, counts: () => ({ clones, compares }), ack: () => ack };
}

const run = (deps: HandlerDeps, incremental = true) => handlePrReview(deps, { owner: 'o', repo: 'r', pullNumber: 5, ...(incremental ? { incremental } : {}) });

describe('a review after a push', () => {
  it('spends nothing when no file the PR changes moved, and keeps the previous review', async () => {
    const t = setup({ marker: reviewedMarker(OLD), compare: { status: 'ahead', files: [{ filename: 'docs/unrelated.md' }] } });
    await run(t.deps);
    expect(t.counts().clones).toBe(0);
    expect(t.client.requests).toHaveLength(0);
    expect(t.ack()).toContain('that review stands');
    expect(t.ack()).toContain(reviewedMarker(HEAD));
  });

  it('spends nothing when the head has not moved at all', async () => {
    const t = setup({ marker: reviewedMarker(HEAD) });
    await run(t.deps);
    expect(t.counts()).toEqual({ clones: 0, compares: 0 });
    expect(t.client.requests).toHaveLength(0);
  });

  it('reviews only the files that changed, and records the new head', async () => {
    const t = setup({ marker: reviewedMarker(OLD), compare: { status: 'ahead', files: [{ filename: 'src/b.ts' }] } });
    await run(t.deps);
    const seen = JSON.stringify(t.client.requests[0]!.messages);
    expect(seen).toContain('B_CHANGED');
    expect(seen).not.toContain('A_CHANGED');
    expect(t.ack()).toContain('Incremental: reviewed the 1 file(s) changed since `aaaaaaa`');
    expect(t.ack()).toContain(reviewedMarker(HEAD));
  });

  it.each([
    ['no earlier review', undefined, { status: 'ahead', files: [] }],
    ['a force-push', reviewedMarker(OLD), { status: 'diverged', files: [{ filename: 'src/b.ts' }] }],
    ['a compare error', reviewedMarker(OLD), new Error('500')],
  ])('reviews everything after %s', async (_why, marker, compare) => {
    const t = setup({ ...(marker ? { marker } : {}), compare });
    await run(t.deps);
    const seen = JSON.stringify(t.client.requests[0]!.messages);
    expect(seen).toContain('A_CHANGED');
    expect(seen).toContain('B_CHANGED');
    expect(t.ack()).not.toContain('Incremental');
    expect(t.ack()).toContain(reviewedMarker(HEAD));
  });

  it('never compares for a review that was not triggered by a push', async () => {
    const t = setup({ marker: reviewedMarker(OLD), compare: { status: 'ahead', files: [{ filename: 'src/b.ts' }] } });
    await run(t.deps, false);
    expect(t.counts().compares).toBe(0);
    expect(JSON.stringify(t.client.requests[0]!.messages)).toContain('A_CHANGED');
  });
});
