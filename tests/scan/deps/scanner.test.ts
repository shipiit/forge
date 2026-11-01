import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execa } from 'execa';
import { depsScanner, runScanners, scannersFor, type FetchLike } from '../../../src/scan/index.js';

/** An OSV that knows a fixed set of package@version → advisory records. */
function osv(known: Record<string, { id: string; [k: string]: unknown }[]>): { fetch: FetchLike; asked: string[] } {
  const asked: string[] = [];
  const byId = new Map(Object.values(known).flat().map((v) => [v.id, v]));
  const fetch: FetchLike = async (url, init) => {
    if (url.endsWith('/v1/querybatch')) {
      const { queries }: { queries: { package: { name: string }; version: string }[] } = JSON.parse(init.body ?? '{}');
      asked.push(...queries.map((q) => `${q.package.name}@${q.version}`));
      return {
        ok: true,
        status: 200,
        json: async () => ({ results: queries.map((q) => ({ vulns: (known[`${q.package.name}@${q.version}`] ?? []).map((v) => ({ id: v.id })) })) }),
      };
    }
    const v = byId.get(decodeURIComponent(url.split('/').pop() ?? ''));
    return v ? { ok: true, status: 200, json: async () => v } : { ok: false, status: 404, json: async () => ({}) };
  };
  return { fetch, asked };
}

const down: FetchLike = async () => ({ ok: false, status: 502, json: async () => ({}) });

type Entry = { version: string; resolved?: string; integrity?: string | null; hasInstallScript?: boolean };

function lock(pkgs: Record<string, Entry>): string {
  const packages: Record<string, unknown> = { '': { name: 'app' } };
  for (const [name, e] of Object.entries(pkgs)) {
    packages[`node_modules/${name}`] = {
      version: e.version,
      resolved: e.resolved ?? `https://registry.npmjs.org/${name}/-/${name.split('/').pop()}-${e.version}.tgz`,
      ...(e.integrity === null ? {} : { integrity: e.integrity ?? 'sha512-x' }),
      ...(e.hasInstallScript ? { hasInstallScript: true } : {}),
    };
  }
  return JSON.stringify({ name: 'app', lockfileVersion: 3, packages }, null, 2);
}

let dir: string;
const git = (...args: string[]) => execa('git', args, { cwd: dir });

async function commit(files: Record<string, string>): Promise<string> {
  for (const [f, text] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(dir, f)), { recursive: true });
    await fs.writeFile(path.join(dir, f), text);
  }
  await git('add', '-A');
  await git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'c', '--allow-empty');
  return (await git('rev-parse', 'HEAD')).stdout.trim();
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-deps-'));
  await git('init', '-q');
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const scan = (fetch: FetchLike, base?: string, only = ['package-lock.json']) =>
  runScanners({ cwd: dir, only: new Set(only), base }, [depsScanner({ fetch })]);

describe('dependency scanner on a pull request', () => {
  it('reports a hijacked release as critical, on the lockfile line, with what to do', async () => {
    const base = await commit({ 'package-lock.json': lock({ debug: { version: '4.4.1' } }) });
    await commit({ 'package-lock.json': lock({ debug: { version: '4.4.2' } }) });
    const { fetch } = osv({ 'debug@4.4.2': [{ id: 'MAL-2025-46974', summary: 'Malicious code in debug (npm)' }] });

    const [f, ...rest] = await scan(fetch, base);
    expect(rest).toEqual([]);
    expect(f).toMatchObject({ file: 'package-lock.json', severity: 'critical', category: 'CWE-506', title: 'Malicious package: debug@4.4.2' });
    const text = await fs.readFile(path.join(dir, 'package-lock.json'), 'utf8');
    expect(f!.startLine).toBe(text.split('\n').findIndex((l) => l.includes('"node_modules/debug"')) + 1);
    expect(f!.body).toContain('rotate');
    expect(f!.body).toContain('https://osv.dev/vulnerability/MAL-2025-46974');
  });

  it('reports a known CVE with a table and the exact upgrade command', async () => {
    const base = await commit({ 'package-lock.json': lock({}) });
    await commit({ 'package-lock.json': lock({ lodash: { version: '4.17.15' } }) });
    const { fetch } = osv({
      'lodash@4.17.15': [
        {
          id: 'GHSA-p6mc-m468-83gw',
          aliases: ['CVE-2020-8203'],
          summary: 'Prototype Pollution in lodash',
          database_specific: { severity: 'HIGH', cwe_ids: ['CWE-1321'] },
          affected: [{ package: { name: 'lodash', ecosystem: 'npm' }, ranges: [{ events: [{ fixed: '4.17.19' }] }] }],
        },
        { id: 'GHSA-low', database_specific: { severity: 'LOW' }, affected: [{ package: { name: 'lodash', ecosystem: 'npm' }, ranges: [{ events: [{ fixed: '4.17.21' }] }] }] },
      ],
    });

    const [f] = await scan(fetch, base);
    expect(f).toMatchObject({ severity: 'high', category: 'CWE-1395' });
    expect(f!.title).toBe('Vulnerable dependency: lodash@4.17.15 (2 known advisories)');
    expect(f!.body).toContain('| [GHSA-p6mc-m468-83gw](https://osv.dev/vulnerability/GHSA-p6mc-m468-83gw) | CVE-2020-8203 | high |');
    expect(f!.body).toContain('`npm install lodash@4.17.21`');
  });

  it('says when there is no fix yet', async () => {
    const { fetch } = osv({ 'a@1.0.0': [{ id: 'GHSA-nofix', database_specific: { severity: 'MODERATE' } }] });
    await commit({ 'package-lock.json': lock({ a: { version: '1.0.0' } }) });
    const [f] = await scan(fetch);
    expect(f!.body).toContain('no patched release yet');
  });

  it('only looks up what the change added or moved, not what was already there', async () => {
    const base = await commit({ 'package-lock.json': lock({ old: { version: '1.0.0' }, bumped: { version: '1.0.0' } }) });
    await commit({ 'package-lock.json': lock({ old: { version: '1.0.0' }, bumped: { version: '1.1.0' }, added: { version: '2.0.0' } }) });
    const { fetch, asked } = osv({});
    expect(await scan(fetch, base)).toEqual([]);
    expect(asked.sort()).toEqual(['added@2.0.0', 'bumped@1.1.0']);
  });

  it('flags an install script that appeared in an update as high', async () => {
    const base = await commit({ 'package-lock.json': lock({ chalk: { version: '5.6.0' } }) });
    await commit({ 'package-lock.json': lock({ chalk: { version: '5.6.1', hasInstallScript: true } }) });
    const [f] = await scan(osv({}).fetch, base);
    expect(f).toMatchObject({ severity: 'high', category: 'CWE-829', title: 'chalk gained an install script in this update' });
  });

  it('flags a new dependency with an install script as medium, and an existing one that always had it not at all', async () => {
    const base = await commit({ 'package-lock.json': lock({ esbuild: { version: '0.20.0', hasInstallScript: true } }) });
    await commit({
      'package-lock.json': lock({ esbuild: { version: '0.21.0', hasInstallScript: true }, 'expresss': { version: '1.0.0', hasInstallScript: true } }),
    });
    const findings = await scan(osv({}).fetch, base);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: 'medium', title: 'New dependency expresss runs an install script' });
  });

  it('treats every package as new when the lockfile is new in this change', async () => {
    const base = await commit({ 'README.md': 'x' });
    await commit({ 'package-lock.json': lock({ native: { version: '1.0.0', hasInstallScript: true } }) });
    const [f] = await scan(osv({}).fetch, base);
    expect(f?.title).toBe('New dependency native runs an install script');
  });

  it.each([
    ['http://registry.example.com/a/-/a-1.0.0.tgz', 'high', 'a is downloaded over plain HTTP'],
    ['git+ssh://git@github.com/x/a.git#abc', 'medium', 'a is installed from outside the package registry'],
    ['https://codeload.github.com/x/a/tar.gz/main', 'medium', 'a is installed from outside the package registry'],
  ])('flags a package resolved from %s', async (resolved, severity, title) => {
    const base = await commit({ 'package-lock.json': lock({}) });
    await commit({ 'package-lock.json': lock({ a: { version: '1.0.0', resolved, integrity: null } }) });
    const [f] = await scan(osv({}).fetch, base);
    expect(f).toMatchObject({ severity, category: 'CWE-494', title });
  });

  it('accepts a private registry tarball, and flags a registry tarball with no integrity hash', async () => {
    const base = await commit({ 'package-lock.json': lock({}) });
    await commit({
      'package-lock.json': lock({
        priv: { version: '1.0.0', resolved: 'https://npm.pkg.github.com/download/@o/priv/1.0.0/-/priv-1.0.0.tgz' },
        bare: { version: '1.0.0', integrity: null },
      }),
    });
    const findings = await scan(osv({}).fetch, base);
    expect(findings.map((f) => f.title)).toEqual(['bare has no integrity hash in the lockfile']);
  });

  it('reports an OSV outage as unchecked, never as clean, and keeps the offline findings', async () => {
    const base = await commit({ 'package-lock.json': lock({}) });
    await commit({ 'package-lock.json': lock({ a: { version: '1.0.0', resolved: 'http://x/a/-/a-1.0.0.tgz' } }) });
    const findings = await scan(down, base);
    expect(findings.map((f) => [f.severity, f.category])).toEqual([
      ['high', 'CWE-494'],
      ['info', 'deps-unchecked'],
    ]);
    expect(findings[1]!.body).toContain('OSV returned 502');
  });

  it('checks the whole lockfile when the base commit cannot be found', async () => {
    await commit({ 'package-lock.json': lock({ a: { version: '1.0.0' } }) });
    const { fetch, asked } = osv({});
    await scan(fetch, 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
    expect(asked).toEqual(['a@1.0.0']);
  });

  it('caps how many packages one scan looks up, and says so', async () => {
    await commit({ 'package-lock.json': lock({ a: { version: '1.0.0' }, b: { version: '1.0.0' }, c: { version: '1.0.0' } }) });
    const { fetch, asked } = osv({});
    const findings = await runScanners({ cwd: dir, only: new Set(['package-lock.json']) }, [depsScanner({ fetch, maxPackages: 2 })]);
    expect(asked).toHaveLength(2);
    expect(findings.map((f) => f.title)).toEqual(['Only the first 2 of 3 packages were checked']);
  });

  it('reports one package installed at several paths once', async () => {
    const text = JSON.stringify(
      {
        lockfileVersion: 3,
        packages: {
          '': {},
          'node_modules/ms': { version: '2.0.0', integrity: 'x', resolved: 'https://registry.npmjs.org/ms/-/ms-2.0.0.tgz' },
          'node_modules/a/node_modules/ms': { version: '2.0.0', integrity: 'x', resolved: 'https://registry.npmjs.org/ms/-/ms-2.0.0.tgz' },
        },
      },
      null,
      2,
    );
    await commit({ 'package-lock.json': text });
    const findings = await scan(osv({ 'ms@2.0.0': [{ id: 'GHSA-ms' }] }).fetch);
    expect(findings).toHaveLength(1);
  });

  it('does nothing, and makes no request, when no lockfile changed', async () => {
    await commit({ 'package-lock.json': lock({ a: { version: '1.0.0' } }), 'src/a.ts': 'export {}' });
    const { fetch, asked } = osv({});
    expect(await scan(fetch, undefined, ['src/a.ts'])).toEqual([]);
    expect(asked).toEqual([]);
  });

  it('reads lockfiles larger than the per-line scanners will', async () => {
    const big: Record<string, Entry> = {};
    for (let i = 0; i < 4000; i++) big[`pkg-${i}`] = { version: '1.0.0' };
    await commit({ 'package-lock.json': lock(big) });
    const { fetch, asked } = osv({});
    await scan(fetch);
    expect(asked).toHaveLength(4000);
  });

  it('suggests the upgrade in the lockfile’s own tool', async () => {
    const vuln = [{ id: 'GHSA-p', affected: [{ package: { name: 'django', ecosystem: 'PyPI' }, ranges: [{ events: [{ fixed: '4.2.1' }] }] }] }];
    await commit({ 'requirements.txt': 'django==4.2.0\n', 'poetry.lock': '[[package]]\nname = "django"\nversion = "4.2.0"\n' });
    const findings = await scan(osv({ 'django@4.2.0': vuln }).fetch, undefined, ['requirements.txt', 'poetry.lock']);
    const bodies = Object.fromEntries(findings.map((f) => [f.file, f.body]));
    expect(bodies['requirements.txt']).toContain("`pip install 'django>=4.2.1'`");
    expect(bodies['poetry.lock']).toContain('`poetry add django@^4.2.1`');
  });
});

describe('the base commit in a real review clone', () => {
  it('is fetched into a shallow clone, so only the change is looked up', async () => {
    const base = await commit({ 'package-lock.json': lock({ old: { version: '1.0.0' } }) });
    await commit({ 'package-lock.json': lock({ old: { version: '1.0.0' }, added: { version: '1.0.0' } }) });
    const bare = `${dir}.git`;
    await execa('git', ['clone', '-q', '--bare', dir, bare]);
    // GitHub serves any reachable commit by SHA; a local bare repository has to be told to.
    await execa('git', ['config', 'uploadpack.allowReachableSHA1InWant', 'true'], { cwd: bare });
    const clone = `${dir}-clone`;
    await execa('git', ['clone', '-q', '--depth', '1', `file://${bare}`, clone]);
    try {
      await expect(execa('git', ['cat-file', '-e', `${base}^{commit}`], { cwd: clone })).rejects.toThrow();
      const { fetch, asked } = osv({});
      await runScanners({ cwd: clone, only: new Set(['package-lock.json']), base }, [depsScanner({ fetch })]);
      expect(asked).toEqual(['added@1.0.0']);
    } finally {
      await fs.rm(bare, { recursive: true, force: true });
      await fs.rm(clone, { recursive: true, force: true });
    }
  });
});

describe('the version it tells you to move to', () => {
  const advisory = (id: string, fixed: string[]) => ({
    id,
    affected: [{ package: { name: 'lib', ecosystem: 'npm' }, ranges: fixed.map((f) => ({ events: [{ fixed: f }] })) }],
  });

  it('is never older than what is installed, and says what stays unfixed', async () => {
    await commit({ 'package-lock.json': lock({ lib: { version: '4.17.15' } }) });
    const { fetch } = osv({
      'lib@4.17.15': [advisory('GHSA-a', ['3.0.0', '4.17.19']), advisory('GHSA-b', ['4.17.21']), advisory('GHSA-c', ['2.0.0'])],
    });
    const [f] = await scan(fetch);
    expect(f!.body).toContain('`npm install lib@4.17.21`');
    expect(f!.body).toContain('That still leaves 1 advisory with no patched release.');
    expect(f!.body).not.toContain('lib@3.0.0');
  });
});

describe('switching it on and off', () => {
  it('runs only when dep_scan is on', () => {
    expect(scannersFor({ secretScan: false, codeScan: false, depScan: true }).map((s) => s.name)).toEqual(['deps']);
    expect(scannersFor({ secretScan: true, codeScan: true, depScan: false }).map((s) => s.name)).not.toContain('deps');
  });
});
