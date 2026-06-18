import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runBash } from '../../../src/agent/tools/bash.js';
import { detectTestCommand, makeRunTestsTool } from '../../../src/agent/tools/tests.js';
import type { ToolContext } from '../../../src/agent/tools/types.js';

let dir: string;
let ctx: ToolContext;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-bash-'));
  ctx = { cwd: dir, supportsVision: true };
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('run_bash', () => {
  it('runs an allowed command and returns stdout + exit code', async () => {
    const out = await runBash.run({ command: 'echo hello' }, ctx);
    const text = (out[0] as { content?: string; text?: string }).text ?? '';
    expect(text).toContain('exit_code: 0');
    expect(text).toContain('hello');
  });

  it('runs in the workspace cwd', async () => {
    await fs.writeFile(path.join(dir, 'marker.txt'), 'x');
    const out = await runBash.run({ command: 'ls' }, ctx);
    expect((out[0] as { text: string }).text).toContain('marker.txt');
  });

  it('enforces a timeout', async () => {
    const out = await runBash.run({ command: 'sleep 5', timeout_ms: 200 }, ctx);
    expect(out[0]).toMatchObject({ isError: true });
    expect((out[0] as { content: string }).content).toMatch(/timed out/);
  });

  it('refuses denylisted commands', async () => {
    const out = await runBash.run({ command: 'curl http://evil.example' }, ctx);
    expect(out[0]).toMatchObject({ isError: true });
    expect((out[0] as { content: string }).content).toMatch(/refused by sandbox/);
  });
});

describe('run_tests detection', () => {
  it('detects npm test from package.json', async () => {
    await fs.writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({ scripts: { test: 'vitest' } }),
    );
    expect(await detectTestCommand(dir)).toBe('npm test');
  });

  it('detects go test from go.mod', async () => {
    await fs.writeFile(path.join(dir, 'go.mod'), 'module x\n');
    expect(await detectTestCommand(dir)).toBe('go test ./...');
  });

  it('honors an explicit override', async () => {
    expect(await detectTestCommand(dir, 'make check')).toBe('make check');
  });

  it('returns null when nothing detected', async () => {
    expect(await detectTestCommand(dir)).toBeNull();
  });

  it('run_tests tool reports when no command is detected', async () => {
    const tool = makeRunTestsTool();
    const out = await tool.run({}, ctx);
    expect((out[0] as { text: string }).text).toMatch(/No test command detected/);
  });
});
