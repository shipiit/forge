import { describe, it, expect } from 'vitest';
import { isLockfile, parseLockfile } from '../../../src/scan/deps/lockfiles.js';

const PACKAGE_LOCK_V3 = `{
  "name": "app",
  "lockfileVersion": 3,
  "packages": {
    "": {
      "name": "app",
      "dependencies": { "debug": "^4.3.0" }
    },
    "node_modules/debug": {
      "version": "4.4.2",
      "resolved": "https://registry.npmjs.org/debug/-/debug-4.4.2.tgz",
      "integrity": "sha512-abc"
    },
    "node_modules/@scope/native": {
      "version": "1.0.0",
      "resolved": "https://registry.npmjs.org/@scope/native/-/native-1.0.0.tgz",
      "integrity": "sha512-def",
      "hasInstallScript": true
    },
    "node_modules/debug/node_modules/ms": {
      "version": "2.1.3"
    },
    "node_modules/local": {
      "resolved": "packages/local",
      "link": true
    }
  }
}`;

describe('which files are lockfiles', () => {
  it.each([
    'package-lock.json',
    'web/package-lock.json',
    'npm-shrinkwrap.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    'requirements.txt',
    'requirements-dev.txt',
    'poetry.lock',
    'uv.lock',
    'Pipfile.lock',
    'Cargo.lock',
  ])('%s is', (f) => expect(isLockfile(f)).toBe(true));

  it.each(['package.json', 'src/yarn.lock.ts', 'requirements.md', 'Cargo.toml', ''])('%s is not', (f) =>
    expect(isLockfile(f)).toBe(false),
  );
});

describe('package-lock.json', () => {
  it('reads v3 entries with their line, source, hash and install script', () => {
    const deps = parseLockfile('package-lock.json', PACKAGE_LOCK_V3);
    expect(deps.map((d) => `${d.name}@${d.version}`)).toEqual(['debug@4.4.2', '@scope/native@1.0.0', 'ms@2.1.3']);
    const debug = deps[0]!;
    expect(debug.line).toBe(PACKAGE_LOCK_V3.split('\n').findIndex((l) => l.includes('"node_modules/debug"')) + 1);
    expect(debug.integrity).toBe('sha512-abc');
    expect(debug.installScript).toBe(false);
    expect(deps[1]!.installScript).toBe(true);
  });

  it('skips the root project and linked workspaces', () => {
    const names = parseLockfile('package-lock.json', PACKAGE_LOCK_V3).map((d) => d.name);
    expect(names).not.toContain('app');
    expect(names).not.toContain('local');
  });

  it('reads nested v1 dependencies', () => {
    const v1 = JSON.stringify(
      { lockfileVersion: 1, dependencies: { a: { version: '1.0.0', dependencies: { b: { version: '2.0.0' } } } } },
      null,
      2,
    );
    expect(parseLockfile('package-lock.json', v1).map((d) => `${d.name}@${d.version}`)).toEqual(['a@1.0.0', 'b@2.0.0']);
  });

  it('returns nothing for a corrupt or empty file instead of throwing', () => {
    expect(parseLockfile('package-lock.json', '{ not json')).toEqual([]);
    expect(parseLockfile('package-lock.json', '')).toEqual([]);
    expect(parseLockfile('package-lock.json', 'null')).toEqual([]);
    expect(parseLockfile('package-lock.json', '{}')).toEqual([]);
  });
});

describe('pnpm-lock.yaml', () => {
  it('reads v9 keys, scoped names, peer suffixes and requiresBuild', () => {
    const text = [
      "lockfileVersion: '9.0'",
      'packages:',
      '  debug@4.4.2:',
      '    resolution: {integrity: sha512-abc}',
      "  '@scope/pkg@1.2.3(react@18.0.0)':",
      '    resolution: {integrity: sha512-def}',
      '    requiresBuild: true',
      '  tarball@1.0.0:',
      '    resolution: {tarball: https://example.com/t.tgz}',
    ].join('\n');
    const deps = parseLockfile('pnpm-lock.yaml', text);
    expect(deps.map((d) => `${d.name}@${d.version}`)).toEqual(['debug@4.4.2', '@scope/pkg@1.2.3', 'tarball@1.0.0']);
    expect(deps[0]!.line).toBe(3);
    expect(deps[1]!.installScript).toBe(true);
    expect(deps[2]!.resolved).toBe('https://example.com/t.tgz');
    expect(deps[2]!.integrity).toBeUndefined();
  });

  it('reads v5 slash keys', () => {
    const text = ['lockfileVersion: 5.4', 'packages:', '  /left-pad/1.3.0_peer:', '    resolution: {integrity: sha512-x}'].join('\n');
    expect(parseLockfile('pnpm-lock.yaml', text).map((d) => `${d.name}@${d.version}`)).toEqual(['left-pad@1.3.0']);
  });

  it('returns nothing without a packages map', () => {
    expect(parseLockfile('pnpm-lock.yaml', "lockfileVersion: '9.0'")).toEqual([]);
    expect(parseLockfile('pnpm-lock.yaml', ': : :')).toEqual([]);
  });
});

describe('yarn.lock', () => {
  it('reads classic entries, scoped names and multi-spec headers', () => {
    const text = [
      '# yarn lockfile v1',
      '',
      'debug@^4.3.0, debug@^4.4.0:',
      '  version "4.4.2"',
      '  resolved "https://registry.yarnpkg.com/debug/-/debug-4.4.2.tgz#abc"',
      '  integrity sha512-abc',
      '',
      '"@babel/core@^7.0.0":',
      '  version "7.24.0"',
    ].join('\n');
    const deps = parseLockfile('yarn.lock', text);
    expect(deps.map((d) => `${d.name}@${d.version}@${d.line}`)).toEqual(['debug@4.4.2@3', '@babel/core@7.24.0@8']);
    expect(deps[0]!.integrity).toBe('sha512-abc');
  });

  it('reads berry entries and drops the workspace itself', () => {
    const text = [
      '__metadata:',
      '  version: 8',
      '',
      '"app@workspace:.":',
      '  version: 0.0.0-use.local',
      '  resolution: "app@workspace:."',
      '',
      '"lodash@npm:^4.17.0":',
      '  version: 4.17.15',
      '  resolution: "lodash@npm:4.17.15"',
      '  checksum: 10c0abc',
    ].join('\n');
    expect(parseLockfile('yarn.lock', text).map((d) => `${d.name}@${d.version}`)).toEqual(['lodash@4.17.15']);
  });
});

describe('Python and Rust', () => {
  it('reads exact pins from requirements files and ignores ranges, comments and options', () => {
    const text = ['# comment', 'Django==4.2.0', 'requests[socks]==2.31.0  # pinned', 'flask>=2', '-r base.txt', 'numpy===1.26.0'].join('\n');
    const deps = parseLockfile('requirements-dev.txt', text);
    expect(deps.map((d) => `${d.name}@${d.version}@${d.line}`)).toEqual(['Django@4.2.0@2', 'requests@2.31.0@3', 'numpy@1.26.0@6']);
    expect(deps.every((d) => d.ecosystem === 'PyPI')).toBe(true);
  });

  it('reads poetry.lock and uv.lock packages, staying in the package across sub-tables', () => {
    const text = [
      '[[package]]',
      'name = "jinja2"',
      'version = "2.10"',
      '',
      '[package.dependencies]',
      'markupsafe = ">=0.23"',
      '',
      '[[package]]',
      'name = "markupsafe"',
      'version = "2.1.0"',
      '',
      '[metadata]',
      'lock-version = "2.0"',
    ].join('\n');
    for (const f of ['poetry.lock', 'uv.lock']) {
      expect(parseLockfile(f, text).map((d) => `${d.name}@${d.version}@${d.line}`)).toEqual(['jinja2@2.10@2', 'markupsafe@2.1.0@9']);
    }
  });

  it('reads Pipfile.lock default and develop sections', () => {
    const text = JSON.stringify({ default: { django: { version: '==4.2.0' } }, develop: { pytest: { version: '==7.0.0' }, editable: {} } }, null, 2);
    expect(parseLockfile('Pipfile.lock', text).map((d) => `${d.name}@${d.version}`)).toEqual(['django@4.2.0', 'pytest@7.0.0']);
  });

  it('reads Cargo.lock as crates.io, with the source', () => {
    const text = ['[[package]]', 'name = "time"', 'version = "0.1.43"', 'source = "registry+https://github.com/rust-lang/crates.io-index"'].join('\n');
    const [dep] = parseLockfile('Cargo.lock', text);
    expect(dep).toMatchObject({ ecosystem: 'crates.io', name: 'time', version: '0.1.43', line: 2 });
  });

  it('skips a package table with no version', () => {
    expect(parseLockfile('Cargo.lock', '[[package]]\nname = "app"\n')).toEqual([]);
  });
});
