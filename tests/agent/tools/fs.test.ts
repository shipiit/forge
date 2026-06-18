import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readFile, writeFile, editFile, listDir, readImage } from '../../../src/agent/tools/fs.js';
import type { ToolContext } from '../../../src/agent/tools/types.js';

let dir: string;
let ctx: ToolContext;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-fs-'));
  ctx = { cwd: dir, supportsVision: true };
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('fs tools', () => {
  it('write_file then read_file round-trips', async () => {
    await writeFile.run({ path: 'a.txt', content: 'HELLO' }, ctx);
    const out = await readFile.run({ path: 'a.txt' }, ctx);
    expect(out[0]).toEqual({ type: 'text', text: 'HELLO' });
  });

  it('write_file creates nested directories', async () => {
    await writeFile.run({ path: 'src/deep/b.txt', content: 'x' }, ctx);
    expect(await fs.readFile(path.join(dir, 'src/deep/b.txt'), 'utf8')).toBe('x');
  });

  it('edit_file replaces a unique string', async () => {
    await writeFile.run({ path: 'c.txt', content: 'one two three' }, ctx);
    await editFile.run({ path: 'c.txt', old_string: 'two', new_string: 'TWO' }, ctx);
    const out = await readFile.run({ path: 'c.txt' }, ctx);
    expect(out[0]).toEqual({ type: 'text', text: 'one TWO three' });
  });

  it('edit_file refuses a non-unique old_string', async () => {
    await writeFile.run({ path: 'd.txt', content: 'x x' }, ctx);
    await expect(
      editFile.run({ path: 'd.txt', old_string: 'x', new_string: 'y' }, ctx),
    ).rejects.toThrow(/not unique/);
  });

  it('edit_file errors when old_string is absent', async () => {
    await writeFile.run({ path: 'e.txt', content: 'abc' }, ctx);
    await expect(
      editFile.run({ path: 'e.txt', old_string: 'zzz', new_string: 'y' }, ctx),
    ).rejects.toThrow(/not found/);
  });

  it('list_dir lists entries with trailing slash for dirs', async () => {
    await writeFile.run({ path: 'f.txt', content: '1' }, ctx);
    await fs.mkdir(path.join(dir, 'sub'));
    const out = await listDir.run({ path: '.' }, ctx);
    expect(out[0]).toEqual({ type: 'text', text: 'f.txt\nsub/' });
  });

  it('read_image returns an image part and base64 for a png', async () => {
    // 1x1 transparent PNG
    const pngB64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    await fs.writeFile(path.join(dir, 'pic.png'), Buffer.from(pngB64, 'base64'));
    const out = await readImage.run({ path: 'pic.png' }, ctx);
    expect(out[0]).toMatchObject({ type: 'image', mime: 'image/png' });
    expect((out[0] as { dataB64: string }).dataB64).toBe(pngB64);
  });

  it('read_image refuses when vision is unsupported', async () => {
    await fs.writeFile(path.join(dir, 'pic.png'), Buffer.from('x'));
    await expect(
      readImage.run({ path: 'pic.png' }, { cwd: dir, supportsVision: false }),
    ).rejects.toThrow(/does not support images/);
  });

  it('rejects path traversal outside the workspace', async () => {
    await expect(readFile.run({ path: '../escape.txt' }, ctx)).rejects.toThrow(/escapes the workspace/);
  });
});
