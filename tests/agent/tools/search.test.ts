import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { search } from '../../../src/agent/tools/search.js';
import type { ToolContext } from '../../../src/agent/tools/types.js';

let dir: string;
let ctx: ToolContext;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-search-'));
  ctx = { cwd: dir, supportsVision: true };
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('search tool', () => {
  it('finds a pattern and reports path:line:text', async () => {
    await fs.writeFile(path.join(dir, 'a.txt'), 'alpha\nNEEDLE here\nbeta\n');
    const out = await search.run({ pattern: 'NEEDLE' }, ctx);
    const text = (out[0] as { text: string }).text;
    expect(text).toMatch(/a\.txt:2:.*NEEDLE here/);
  });

  it('reports no matches cleanly', async () => {
    await fs.writeFile(path.join(dir, 'b.txt'), 'nothing interesting\n');
    const out = await search.run({ pattern: 'ZZZZZ' }, ctx);
    expect((out[0] as { text: string }).text).toBe('(no matches)');
  });

  it('respects max_results cap', async () => {
    const many = Array.from({ length: 20 }, (_, i) => `match${i} TARGET`).join('\n');
    await fs.writeFile(path.join(dir, 'c.txt'), many + '\n');
    const out = await search.run({ pattern: 'TARGET', max_results: 5 }, ctx);
    const text = (out[0] as { text: string }).text;
    expect(text).toMatch(/truncated/);
    expect(text.split('\n').filter((l) => l.includes('TARGET')).length).toBe(5);
  });
});
