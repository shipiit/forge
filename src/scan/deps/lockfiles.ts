import path from 'node:path';
import yaml from 'js-yaml';

/**
 * Lockfile readers.
 *
 * The lockfile, not the manifest, because the lockfile is what gets installed.
 * `"debug": "^4.3.0"` in package.json is a range; the version that ran its
 * install script on a developer's laptop is the one written in the lockfile.
 */

/** OSV ecosystem names. */
export type Ecosystem = 'npm' | 'PyPI' | 'crates.io';

export interface Dep {
  ecosystem: Ecosystem;
  name: string;
  version: string;
  /** 1-based line of the entry, so a finding lands on the line that changed. */
  line: number;
  /** Where the package manager downloads it from, when the lockfile says. */
  resolved?: string;
  integrity?: string;
  /** The package runs code on install (npm `hasInstallScript`, pnpm `requiresBuild`). */
  installScript?: boolean;
}

const LOCKFILES: Record<string, (text: string) => Dep[]> = {
  'package-lock.json': parsePackageLock,
  'npm-shrinkwrap.json': parsePackageLock,
  'pnpm-lock.yaml': parsePnpmLock,
  'yarn.lock': parseYarnLock,
  'requirements.txt': parseRequirements,
  'poetry.lock': (t) => parseTomlPackages(t, 'PyPI'),
  'uv.lock': (t) => parseTomlPackages(t, 'PyPI'),
  'Pipfile.lock': parsePipfileLock,
  'Cargo.lock': (t) => parseTomlPackages(t, 'crates.io'),
};

/** Requirements files go by many names; any of them is a pinned list. */
const REQUIREMENTS = /^requirements[\w.-]*\.txt$/;

export function isLockfile(file: string): boolean {
  const base = path.posix.basename(file);
  return base in LOCKFILES || REQUIREMENTS.test(base);
}

/** Every pinned dependency in a lockfile. Never throws: a corrupt lockfile has no dependencies to check. */
export function parseLockfile(file: string, text: string): Dep[] {
  const base = path.posix.basename(file);
  const parse = LOCKFILES[base] ?? (REQUIREMENTS.test(base) ? parseRequirements : undefined);
  if (!parse) return [];
  try {
    return parse(text);
  } catch {
    return [];
  }
}

/** First line on which each JSON object key opens, for placing findings. */
function jsonKeyLines(text: string): Map<string, number> {
  const lines = new Map<string, number>();
  text.split('\n').forEach((l, i) => {
    const m = /^\s*"((?:[^"\\]|\\.)*)"\s*:\s*\{/.exec(l);
    if (m && !lines.has(m[1]!)) lines.set(m[1]!, i + 1);
  });
  return lines;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

/** npm v1, v2 and v3 lockfiles. */
export function parsePackageLock(text: string): Dep[] {
  const doc: unknown = JSON.parse(text);
  if (!isRecord(doc)) return [];
  const lines = jsonKeyLines(text);
  const out: Dep[] = [];

  // v2 and v3: a flat map keyed by install path. The root project is "".
  if (isRecord(doc.packages)) {
    for (const [key, entry] of Object.entries(doc.packages)) {
      if (!key || !isRecord(entry) || entry.link === true) continue;
      const name = str(entry.name) ?? key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
      const version = str(entry.version);
      if (!name || !version || !key.includes('node_modules/')) continue;
      out.push({
        ecosystem: 'npm',
        name,
        version,
        line: lines.get(key) ?? 1,
        resolved: str(entry.resolved),
        integrity: str(entry.integrity),
        installScript: entry.hasInstallScript === true,
      });
    }
    return out;
  }

  // v1: nested `dependencies`.
  const walk = (deps: unknown): void => {
    if (!isRecord(deps)) return;
    for (const [name, entry] of Object.entries(deps)) {
      if (!isRecord(entry)) continue;
      const version = str(entry.version);
      if (version) {
        out.push({
          ecosystem: 'npm',
          name,
          version,
          line: lines.get(name) ?? 1,
          resolved: str(entry.resolved),
          integrity: str(entry.integrity),
        });
      }
      walk(entry.dependencies);
    }
  };
  walk(doc.dependencies);
  return out;
}

/** `name@1.2.3`, `@scope/name@1.2.3(peer@1.0.0)`, or the v5 `/name/1.2.3_peer`. */
function pnpmKey(key: string): { name: string; version: string } | undefined {
  const k = key.replace(/^\//, '').replace(/\(.*$/, '');
  const at = k.lastIndexOf('@');
  if (at > 0) return { name: k.slice(0, at), version: k.slice(at + 1) };
  const slash = k.lastIndexOf('/');
  if (slash > 0) return { name: k.slice(0, slash), version: k.slice(slash + 1).replace(/_.*$/, '') };
  return undefined;
}

export function parsePnpmLock(text: string): Dep[] {
  const doc: unknown = yaml.load(text, { schema: yaml.FAILSAFE_SCHEMA });
  if (!isRecord(doc) || !isRecord(doc.packages)) return [];
  const lines = new Map<string, number>();
  text.split('\n').forEach((l, i) => {
    const m = /^ {2}['"]?([^'"\s][^'"]*?)['"]?:\s*$/.exec(l);
    if (m && !lines.has(m[1]!)) lines.set(m[1]!, i + 1);
  });
  const out: Dep[] = [];
  for (const [key, entry] of Object.entries(doc.packages)) {
    const id = pnpmKey(key);
    if (!id || !isRecord(entry)) continue;
    const resolution = isRecord(entry.resolution) ? entry.resolution : {};
    out.push({
      ecosystem: 'npm',
      name: id.name,
      version: str(entry.version) ?? id.version,
      line: lines.get(key) ?? 1,
      resolved: str(resolution.tarball) ?? str(resolution.repo),
      integrity: str(resolution.integrity),
      installScript: entry.requiresBuild === 'true',
    });
  }
  return out;
}

/** The package name in a yarn spec: `lodash@^4`, `"@babel/core@^7"`, `foo@npm:bar@1`. */
function yarnName(spec: string): string {
  const s = spec.trim().replace(/^"|"$/g, '');
  const at = s.indexOf('@', 1);
  return at > 0 ? s.slice(0, at) : s;
}

/** Yarn classic (v1) and Berry lockfiles. */
export function parseYarnLock(text: string): Dep[] {
  const out: Dep[] = [];
  let current: Dep | undefined;
  const flush = () => {
    if (current?.name && current.version) out.push(current);
    current = undefined;
  };
  text.split('\n').forEach((raw, i) => {
    if (/^\S.*:\s*$/.test(raw) && !raw.startsWith('#') && !raw.startsWith('__metadata')) {
      flush();
      const firstSpec = raw.replace(/:\s*$/, '').split(/,\s*/)[0] ?? '';
      current = { ecosystem: 'npm', name: yarnName(firstSpec), version: '', line: i + 1 };
      return;
    }
    if (!current) return;
    const m = /^\s+(version|resolved|integrity|checksum|resolution):?\s+"?([^"\s]+)"?\s*$/.exec(raw);
    if (!m) return;
    const [, field, value] = m;
    if (field === 'version') current.version = value!;
    else if (field === 'resolved' || field === 'resolution') current.resolved ??= value;
    else current.integrity = value;
  });
  flush();
  // Berry records the workspace itself as a package; it has nothing to look up.
  return out.filter((d) => !d.resolved?.includes('@workspace:'));
}

/** Only exact pins can be looked up; a range has no single installed version. */
export function parseRequirements(text: string): Dep[] {
  const out: Dep[] = [];
  text.split('\n').forEach((raw, i) => {
    const m = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]*\])?\s*===?\s*([A-Za-z0-9.!+_-]+)/.exec(raw);
    if (m) out.push({ ecosystem: 'PyPI', name: m[1]!, version: m[2]!, line: i + 1 });
  });
  return out;
}

/** `[[package]]` tables with `name` and `version`: poetry.lock, uv.lock, Cargo.lock. */
export function parseTomlPackages(text: string, ecosystem: Ecosystem): Dep[] {
  const out: Dep[] = [];
  let current: { name?: string; version?: string; resolved?: string; line: number } | undefined;
  const flush = () => {
    if (current?.name && current.version) {
      out.push({ ecosystem, name: current.name, version: current.version, line: current.line, resolved: current.resolved });
    }
    current = undefined;
  };
  text.split('\n').forEach((raw, i) => {
    if (/^\s*\[\[package\]\]\s*$/.test(raw)) {
      flush();
      current = { line: i + 1 };
      return;
    }
    if (/^\s*\[/.test(raw)) {
      // A sub-table such as [package.dependencies] belongs to the same package;
      // anything else ends it.
      if (!/^\s*\[package\./.test(raw)) flush();
      return;
    }
    if (!current) return;
    const m = /^\s*(name|version|source)\s*=\s*"([^"]*)"/.exec(raw);
    if (!m) return;
    if (m[1] === 'name') {
      current.name = m[2]!;
      current.line = i + 1;
    } else if (m[1] === 'version') current.version = m[2]!;
    else current.resolved = m[2]!;
  });
  flush();
  return out;
}

export function parsePipfileLock(text: string): Dep[] {
  const doc: unknown = JSON.parse(text);
  if (!isRecord(doc)) return [];
  const lines = jsonKeyLines(text);
  const out: Dep[] = [];
  for (const section of ['default', 'develop']) {
    const pkgs = doc[section];
    if (!isRecord(pkgs)) continue;
    for (const [name, entry] of Object.entries(pkgs)) {
      const version = isRecord(entry) ? str(entry.version)?.replace(/^==/, '') : undefined;
      if (version) out.push({ ecosystem: 'PyPI', name, version, line: lines.get(name) ?? 1 });
    }
  }
  return out;
}
