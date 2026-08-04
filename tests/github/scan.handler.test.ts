import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { handleScan, type HandlerDeps } from '../../src/github/handlers.js';
import type { WorkspacePort, Workspace } from '../../src/github/workspace.js';
import type { OctokitLike } from '../../src/github/pr.js';

/** A workspace with real files on disk, so the scanners have something to read. */
function workspace(seed: Record<string, string>) {
  const dirs: string[] = [];
  const port: WorkspacePort = {
    async clone() {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-scan-'));
      dirs.push(dir);
      for (const [p, content] of Object.entries(seed)) {
        await fs.mkdir(path.dirname(path.join(dir, p)), { recursive: true });
        await fs.writeFile(path.join(dir, p), content);
      }
      return { dir, git: {} as never, cleanup: async () => {} } as Workspace;
    },
    async createBranch() {},
    async commitAll() { return false; },
    async pushBranch() {},
    async diffHead() { return ''; },
    async commitSubjects() { return ''; },
  };
  return { port, cleanup: () => Promise.all(dirs.map((d) => fs.rm(d, { recursive: true, force: true }))) };
}

function octokitWith(existing: Array<{ id: number; body: string }>) {
  const created: any[] = [];
  const updated: any[] = [];
  const checks: any[] = [];
  const octokit = {
    rest: {
      issues: {
        async createComment(p: any) { created.push(p); return { data: { id: 99, html_url: 'u' } }; },
        async updateComment(p: any) { updated.push(p); return { data: { html_url: 'u' } }; },
        async listComments() { return { data: existing }; },
      },
      pulls: { async get() { return { data: { head: { sha: 'abc' } } }; } },
      checks: { async create(p: any) { checks.push(p); return { data: {} }; } },
    },
  } as unknown as OctokitLike;
  return { octokit, created, updated, checks };
}

const deps = (octokit: OctokitLike, port: WorkspacePort): HandlerDeps =>
  ({ octokit, token: 't', log: () => {}, workspace: port } as unknown as HandlerDeps);

const args = { owner: 'o', repo: 'r', issueNumber: 7, pullNumber: 7, ref: 'main' };

describe('the scan comment', () => {
  it('is written once and then rewritten in place', async () => {
    // The scan runs on every push. A fresh report under each one is how a
    // scanner gets collapsed and stopped being read.
    const ws = workspace({ 'src/a.ts': 'export const a = 1;\n' });
    const first = octokitWith([]);
    await handleScan(deps(first.octokit, ws.port), args);
    expect(first.created).toHaveLength(1);
    expect(first.updated).toHaveLength(0);
    expect(first.created[0].body).toContain('<!-- forge-scan -->');

    const second = octokitWith([{ id: 42, body: first.created[0].body }]);
    await handleScan(deps(second.octokit, ws.port), args);
    expect(second.created).toHaveLength(0);
    expect(second.updated).toHaveLength(1);
    expect(second.updated[0].comment_id).toBe(42);
    await ws.cleanup();
  });

  it('posts a new one rather than losing the report when comments cannot be read', async () => {
    const ws = workspace({ 'src/a.ts': 'export const a = 1;\n' });
    const { octokit, created } = octokitWith([]);
    (octokit as any).rest.issues.listComments = async () => { throw new Error('403'); };
    await handleScan(deps(octokit, ws.port), args);
    expect(created).toHaveLength(1);
    await ws.cleanup();
  });
});

describe('the check run that gates the merge', () => {
  it('fails the check when something blocking is found', async () => {
    const ws = workspace({ 'src/api.ts': 'exec(`convert ${req.query.file} out.png`);\n' });
    const { octokit, checks } = octokitWith([]);
    await handleScan(deps(octokit, ws.port), args);
    expect(checks[0].conclusion).toBe('failure');
    expect(checks[0].name).toContain('security scan');
    await ws.cleanup();
  });

  it('passes on a clean branch, and survives having no permission to say so', async () => {
    const ws = workspace({ 'src/a.ts': 'export const a = 1;\n' });
    const clean = octokitWith([]);
    await handleScan(deps(clean.octokit, ws.port), args);
    expect(clean.checks[0].conclusion).toBe('success');

    const denied = octokitWith([]);
    (denied.octokit as any).rest.checks.create = async () => { throw new Error('Resource not accessible'); };
    // The report is the point; the check run is a bonus the workflow may not
    // have been given permission for.
    await expect(handleScan(deps(denied.octokit, ws.port), args)).resolves.toBeUndefined();
    expect(denied.created).toHaveLength(1);
    await ws.cleanup();
  });
});
