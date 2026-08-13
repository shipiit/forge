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

describe('what the gate is allowed to block on', () => {
  // The scan reads the whole tree; the gate answers a narrower question — may
  // THIS change merge. Blocking on the whole tree means the first pull request
  // after switching the scanner on cannot merge until somebody clears every
  // historic finding, and what people do at that point is switch it off.
  const tree = {
    'src/api.ts': 'exec(`convert ${req.query.file} out.png`);\n',
    'README.md': '# docs\n',
  };
  const touching = (files: string[]) => {
    const o = octokitWith([]);
    (o.octokit as any).rest.pulls.listFiles = async () => ({ data: files.map((filename) => ({ filename })) });
    return o;
  };

  it('does not block a change on a finding somewhere else in the repository', async () => {
    const ws = workspace(tree);
    const { octokit, checks } = touching(['README.md']);
    await handleScan(deps(octokit, ws.port), args);
    expect(checks[0].conclusion).toBe('success');
    // Green, but not silent about why — otherwise the debt disappears.
    expect(checks[0].output.title).toContain('pre-existing');
    await ws.cleanup();
  });

  it('still blocks when the finding is in a file the change touched', async () => {
    const ws = workspace(tree);
    const { octokit, checks } = touching(['src/api.ts']);
    await handleScan(deps(octokit, ws.port), args);
    expect(checks[0].conclusion).toBe('failure');
    await ws.cleanup();
  });

  it('keeps reporting the whole tree even when the gate is scoped', async () => {
    // Scoping the gate must not shrink the report. A credential committed last
    // year is still leaked whether or not today's diff went near it.
    const ws = workspace(tree);
    const { octokit, created } = touching(['README.md']);
    await handleScan(deps(octokit, ws.port), args);
    expect(created[0].body).toContain('src/api.ts');
    await ws.cleanup();
  });

  it('gates on everything when the changed files cannot be read', async () => {
    // Fails closed. Guessing "nothing was touched" would turn one failed API
    // call into a green check on a pull request that adds a credential.
    const ws = workspace(tree);
    const denied = touching([]);
    (denied.octokit as any).rest.pulls.listFiles = async () => { throw new Error('403'); };
    await handleScan(deps(denied.octokit, ws.port), args);
    expect(denied.checks[0].conclusion).toBe('failure');

    // Same when the API surface has no listFiles at all.
    const old = octokitWith([]);
    await handleScan(deps(old.octokit, ws.port), args);
    expect(old.checks[0].conclusion).toBe('failure');
    await ws.cleanup();
  });

  it('reads past the first page of changed files', async () => {
    // Unpaginated, a finding on file 101 of a large pull request would stop
    // gating — the quietest possible failure.
    const ws = workspace(tree);
    const { octokit, checks } = touching([]);
    (octokit as any).rest.pulls.listFiles = async () => ({ data: [{ filename: 'README.md' }] });
    (octokit as any).paginate = async () => [{ filename: 'README.md' }, { filename: 'src/api.ts' }];
    await handleScan(deps(octokit, ws.port), args);
    expect(checks[0].conclusion).toBe('failure');
    await ws.cleanup();
  });
});
