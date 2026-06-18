import { promises as fs } from 'node:fs';
import path from 'node:path';

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', 'vendor', '__pycache__', '.venv', 'target', 'coverage']);
const KEY_FILES = [
  'README.md',
  'package.json',
  'pyproject.toml',
  'requirements.txt',
  'go.mod',
  'Cargo.toml',
  'pom.xml',
  'build.gradle',
  'Gemfile',
  'composer.json',
  'Makefile',
  'tsconfig.json',
];

interface MapOptions {
  maxEntries?: number;
  maxDepth?: number;
}

/**
 * Build a compact, token-bounded map of a repository: detected key files plus a
 * depth-limited directory tree (heavy/generated dirs skipped). Prepended to the
 * agent's context so it can orient in a large repo without spending tool calls
 * just to discover the layout.
 */
export async function buildRepoMap(cwd: string, opts: MapOptions = {}): Promise<string> {
  const maxEntries = opts.maxEntries ?? 400;
  const maxDepth = opts.maxDepth ?? 3;

  const present: string[] = [];
  for (const f of KEY_FILES) {
    try {
      await fs.access(path.join(cwd, f));
      present.push(f);
    } catch {
      /* not present */
    }
  }

  const lines: string[] = [];
  let count = 0;
  async function walk(dir: string, depth: number, prefix: string): Promise<void> {
    if (depth > maxDepth || count >= maxEntries) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1));
    for (const e of entries) {
      if (count >= maxEntries) {
        lines.push(`${prefix}… (truncated)`);
        return;
      }
      if (e.name.startsWith('.') && e.name !== '.github') continue;
      if (e.isDirectory() && SKIP_DIRS.has(e.name)) continue;
      count++;
      lines.push(`${prefix}${e.name}${e.isDirectory() ? '/' : ''}`);
      if (e.isDirectory()) await walk(path.join(dir, e.name), depth + 1, prefix + '  ');
    }
  }
  await walk(cwd, 0, '');

  return (
    `Repository map (key files: ${present.join(', ') || 'none detected'}):\n\n` +
    '```\n' +
    lines.join('\n') +
    '\n```'
  );
}
