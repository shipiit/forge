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

describe('a review scans the change, an audit scans everything', () => {
  // Reviewing a change against the whole repository reports the same historic
  // findings on every pull request anybody opens. The author reads a list
  // dominated by files they have never touched, decides the tool is talking
  // about somebody else's problem, and stops reading.
  const tree = {
    'src/api.ts': 'exec(`convert ${req.query.file} out.png`);\n',
    'README.md': '# docs\n',
  };
  const touching = (files: string[]) => {
    const o = octokitWith([]);
    (o.octokit as any).rest.pulls.listFiles = async () => ({ data: files.map((filename) => ({ filename })) });
    return o;
  };

  it('says nothing about a file the change never touched', async () => {
    const ws = workspace(tree);
    const { octokit, checks, created } = touching(['README.md']);
    await handleScan(deps(octokit, ws.port), args);
    expect(checks[0].conclusion).toBe('success');
    // Not merely unblocking — absent. The report is about this change.
    expect(created[0].body).not.toContain('src/api.ts');
    await ws.cleanup();
  });

  it('still blocks when the finding is in a file the change touched', async () => {
    const ws = workspace(tree);
    const { octokit, checks, created } = touching(['src/api.ts']);
    await handleScan(deps(octokit, ws.port), args);
    expect(checks[0].conclusion).toBe('failure');
    expect(created[0].body).toContain('src/api.ts');
    await ws.cleanup();
  });

  it('says which of the two it did, so the number is not a mystery', async () => {
    const ws = workspace(tree);
    const { octokit, created } = touching(['README.md']);
    await handleScan(deps(octokit, ws.port), args);
    expect(created[0].body).toContain('the files this pull request changes');
    await ws.cleanup();
  });

  it('scans the whole tree for an audit, where there is no change to scope to', async () => {
    // `/secrets` and the scheduled run are where a credential committed last
    // year belongs — read once and acted on, not attached to unrelated work.
    const ws = workspace(tree);
    const { octokit, created } = octokitWith([]);
    await handleScan(deps(octokit, ws.port), { owner: 'o', repo: 'r', issueNumber: 7, ref: 'main' });
    expect(created[0].body).toContain('src/api.ts');
    expect(created[0].body).toContain('the repository');
    await ws.cleanup();
  });

  it('falls back to the whole tree when the changed files cannot be read', async () => {
    // Scanning too much is noise; scanning nothing is a green check that means
    // nothing. One failed API call must not become the second.
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
    // Unpaginated, file 101 of a large pull request would go unscanned — the
    // quietest possible failure.
    const ws = workspace(tree);
    const { octokit, checks } = touching([]);
    (octokit as any).rest.pulls.listFiles = async () => ({ data: [{ filename: 'README.md' }] });
    (octokit as any).paginate = async () => [{ filename: 'README.md' }, { filename: 'src/api.ts' }];
    await handleScan(deps(octokit, ws.port), args);
    expect(checks[0].conclusion).toBe('failure');
    await ws.cleanup();
  });
});
