import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildRepoMap } from '../../src/agent/repomap.js';

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-map-'));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('buildRepoMap', () => {
  it('lists key files and the directory tree, skipping heavy dirs', async () => {
    await fs.writeFile(path.join(dir, 'package.json'), '{}');
    await fs.writeFile(path.join(dir, 'README.md'), '# x');
    await fs.mkdir(path.join(dir, 'src'));
    await fs.writeFile(path.join(dir, 'src', 'index.ts'), '');
    await fs.mkdir(path.join(dir, 'node_modules'));
    await fs.writeFile(path.join(dir, 'node_modules', 'junk.js'), '');

    const map = await buildRepoMap(dir);
    expect(map).toContain('package.json');
    expect(map).toContain('README.md');
    expect(map).toContain('src/');
    expect(map).toContain('index.ts');
    expect(map).not.toContain('node_modules');
    expect(map).not.toContain('junk.js');
  });

  it('respects the entry cap', async () => {
    for (let i = 0; i < 30; i++) await fs.writeFile(path.join(dir, `f${i}.txt`), '');
    const map = await buildRepoMap(dir, { maxEntries: 10 });
    expect(map).toContain('truncated');
  });
});
