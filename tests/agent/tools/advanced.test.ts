import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execa } from 'execa';
import { multiEdit, glob, gitHistory } from '../../../src/agent/tools/advanced.js';
import type { ToolContext } from '../../../src/agent/tools/types.js';

let dir: string;
let ctx: ToolContext;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-adv-'));
  ctx = { cwd: dir, supportsVision: true };
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('multi_edit', () => {
  it('applies multiple edits atomically', async () => {
    await fs.writeFile(path.join(dir, 'a.ts'), 'const a = 1;\nconst b = 2;\n');
    await multiEdit.run(
      { path: 'a.ts', edits: [{ old_string: 'a = 1', new_string: 'a = 10' }, { old_string: 'b = 2', new_string: 'b = 20' }] },
      ctx,
    );
    expect(await fs.readFile(path.join(dir, 'a.ts'), 'utf8')).toBe('const a = 10;\nconst b = 20;\n');
  });

  it('makes no change if any edit fails', async () => {
    await fs.writeFile(path.join(dir, 'b.ts'), 'x = 1;\n');
    await expect(
      multiEdit.run({ path: 'b.ts', edits: [{ old_string: 'x = 1', new_string: 'x = 2' }, { old_string: 'NOPE', new_string: 'z' }] }, ctx),
    ).rejects.toThrow(/edit #2/);
    expect(await fs.readFile(path.join(dir, 'b.ts'), 'utf8')).toBe('x = 1;\n');
  });
});

describe('glob', () => {
  it('finds files by pattern', async () => {
    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.writeFile(path.join(dir, 'src', 'one.ts'), '');
    await fs.writeFile(path.join(dir, 'src', 'two.ts'), '');
    await fs.writeFile(path.join(dir, 'src', 'skip.js'), '');
    const out = await glob.run({ pattern: 'src/*.ts' }, ctx);
    const text = (out[0] as { text: string }).text;
    expect(text).toContain('one.ts');
    expect(text).toContain('two.ts');
    expect(text).not.toContain('skip.js');
  });
});

describe('git_history', () => {
  it('returns recent commits in log mode', async () => {
    await execa('git', ['init', '-q'], { cwd: dir });
    await execa('git', ['config', 'user.email', 't@t.co'], { cwd: dir });
    await execa('git', ['config', 'user.name', 't'], { cwd: dir });
    await fs.writeFile(path.join(dir, 'f.txt'), '1');
    await execa('git', ['add', '-A'], { cwd: dir });
    await execa('git', ['commit', '-qm', 'initial commit'], { cwd: dir });
    const out = await gitHistory.run({ mode: 'log' }, ctx);
    expect((out[0] as { text: string }).text).toContain('initial commit');
  });
});
