import { describe, it, expect, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { handleAudit, type HandlerDeps } from '../../src/github/handlers.js';
import type { Workspace, WorkspacePort } from '../../src/github/workspace.js';
import type { OctokitLike } from '../../src/github/pr.js';
import { FakeLLMClient } from '../../src/providers/fake.js';
import type { ChatResult } from '../../src/providers/types.js';
import { BUILT_IN_SLICES } from '../../src/audit/slices.js';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});

const port: WorkspacePort = {
  async clone() {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-audit-'));
    dirs.push(dir);
    await fs.writeFile(path.join(dir, 'app.py'), 'def handler(req):\n    db.execute("SELECT * FROM t WHERE id=" + req.args["id"])\n');
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'flask==3.0.0\n');
    return { dir, git: {} as never, cleanup: async () => {} } as Workspace;
  },
  async createBranch() {},
  async commitAll() { return false; },
  async pushBranch() {},
  async diffHead() { return ''; },
  async commitSubjects() { return ''; },
};

const reply = (text: string): ChatResult => ({ text, toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 }, stopReason: 'end' });
const sqli = { file: 'app.py', startLine: 2, endLine: 2, lens: 'security', severity: 'critical', category: 'CWE-89', title: 'Anyone can read any row via id', body: 'scenario' };

describe('/audit', () => {
  it('runs the applicable specialists, verifies, and posts findings with a coverage map', async () => {
    const updates: string[] = [];
    const octokit = {
      rest: {
        issues: {
          async createComment() { return { data: { id: 7, html_url: 'u' } }; },
          async updateComment(p: { body: string }) { updates.push(p.body); return { data: {} }; },
          async listComments() { return { data: [] }; },
        },
        pulls: { async get() { return { data: {} }; } },
        repos: {},
      },
      async request() { throw new Error('not used'); },
    } as unknown as OctokitLike;

    // A Python backend with no frontend and no model SDK: six specialists, then the verifier.
    const slices = BUILT_IN_SLICES.filter((s) => s.needs === 'always');
    const envelope = JSON.stringify({ findings: [sqli], coverage: [{ row: 5, verdict: 'FAIL', note: 'app.py:2' }], checked: [], notTested: [] });
    const client = new FakeLLMClient([...slices.map(() => reply(envelope)), reply('[{"id":0,"verdict":"confirmed"}]')]);

    await handleAudit(
      { octokit, client, token: 't', log: () => {}, workspace: port, scanners: [], externalScanners: false } as unknown as HandlerDeps,
      { owner: 'o', repo: 'r', issueNumber: 1, ref: 'main' },
    );

    expect(client.requests).toHaveLength(slices.length + 1);
    const systems = client.requests.map((r) => r.system ?? '');
    for (const s of slices) expect(systems.some((sys) => sys.includes(`Your slice: ${s.title}`))).toBe(true);
    expect(systems.at(-1)).toContain('Known false-positive shapes');

    const body = updates.at(-1)!;
    expect(body).toContain('Anyone can read any row via id');
    expect(body).toContain('Coverage map');
    expect(body).toContain('❌ FAIL');
    expect(body).toContain('Skipped Frontend & client');
    expect(body).toContain('Skipped LLM & agent surface');
    expect(body).toContain('Every finding was re-checked against the code; 0 dropped');
  });
});
