import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  validateServiceAccount,
  buildEnvContent,
  writeSecureFile,
  ensureGitignore,
  saveVertexCredential,
} from '../src/setup.js';

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-setup-'));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const fakeSA = JSON.stringify({
  type: 'service_account',
  project_id: 'my-proj',
  private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
  client_email: 'svc@my-proj.iam.gserviceaccount.com',
});

describe('validateServiceAccount', () => {
  it('accepts a valid service account and returns identifiers', () => {
    expect(validateServiceAccount(fakeSA)).toEqual({
      projectId: 'my-proj',
      clientEmail: 'svc@my-proj.iam.gserviceaccount.com',
    });
  });
  it('rejects non-JSON', () => {
    expect(() => validateServiceAccount('not json')).toThrow(/valid JSON/);
  });
  it('rejects JSON that is not a service account', () => {
    expect(() => validateServiceAccount('{"type":"user"}')).toThrow(/service_account/);
  });
});

describe('buildEnvContent', () => {
  it('renders vertex env', () => {
    const env = buildEnvContent({ provider: 'vertex', project: 'p', location: 'us-central1', model: 'gemini-2.5-pro', credentialsPath: '/x/sa.json' });
    expect(env).toContain('LLM_PROVIDER=vertex');
    expect(env).toContain('VERTEX_PROJECT=p');
    expect(env).toContain('GOOGLE_APPLICATION_CREDENTIALS=/x/sa.json');
  });
  it('renders anthropic env', () => {
    const env = buildEnvContent({ provider: 'anthropic', apiKey: 'sk-ant-xxx' });
    expect(env).toContain('LLM_PROVIDER=anthropic');
    expect(env).toContain('ANTHROPIC_API_KEY=sk-ant-xxx');
  });
});

describe('secure file + gitignore', () => {
  it('writes a file with 0600 permissions', async () => {
    const p = path.join(dir, 'sub', '.env');
    await writeSecureFile(p, 'SECRET=1');
    const stat = await fs.stat(p);
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it('adds missing entries to .gitignore without duplicating', async () => {
    await fs.writeFile(path.join(dir, '.gitignore'), '.env\n');
    await ensureGitignore(dir, ['.env', '.forge/']);
    const gi = await fs.readFile(path.join(dir, '.gitignore'), 'utf8');
    expect(gi.match(/\.env/g)?.length).toBe(1); // not duplicated
    expect(gi).toContain('.forge/');
  });
});

describe('saveVertexCredential', () => {
  it('saves the SA json to a gitignored 0600 file and returns project id', async () => {
    const res = await saveVertexCredential(dir, fakeSA);
    expect(res.projectId).toBe('my-proj');
    expect(res.path).toBe(path.join(dir, '.forge', 'vertex-sa.json'));
    const stat = await fs.stat(res.path);
    expect(stat.mode & 0o777).toBe(0o600);
    const gi = await fs.readFile(path.join(dir, '.gitignore'), 'utf8');
    expect(gi).toContain('.forge/');
  });

  it('refuses to save invalid credentials', async () => {
    await expect(saveVertexCredential(dir, '{"type":"user"}')).rejects.toThrow(/service_account/);
  });
});
