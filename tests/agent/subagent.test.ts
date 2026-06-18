import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeSubagentTool, orchestratorToolset } from '../../src/agent/subagent.js';
import { FakeLLMClient } from '../../src/providers/fake.js';
import type { ChatResult } from '../../src/providers/types.js';

const usage = { inputTokens: 1, outputTokens: 1 };
let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-sub-'));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('spawn_subagent', () => {
  it('runs a nested agent that edits the shared workspace and returns a summary', async () => {
    // Sub-agent script: write a file, then finish.
    const client = new FakeLLMClient([
      { text: '', toolCalls: [{ id: 's1', name: 'write_file', args: { path: 'module.js', content: 'export const x=1;\n' } }], usage, stopReason: 'tool_use' },
      { text: 'Created module.js', toolCalls: [], usage, stopReason: 'end' },
    ]);
    const tool = makeSubagentTool({ client, limits: { maxIterations: 5, maxOutputTokens: 100 }, depth: 0, maxDepth: 2 });

    const out = await tool.run({ task: 'create module.js' }, { cwd: dir, supportsVision: true });

    expect(await fs.readFile(path.join(dir, 'module.js'), 'utf8')).toBe('export const x=1;\n');
    expect((out[0] as { text: string }).text).toMatch(/Sub-agent completed/);
    expect((out[0] as { text: string }).text).toMatch(/Created module\.js/);
  });

  it('refuses to recurse past maxDepth', async () => {
    const client = new FakeLLMClient([]); // should never be called
    const tool = makeSubagentTool({ client, limits: { maxIterations: 5, maxOutputTokens: 100 }, depth: 2, maxDepth: 2 });
    const out = await tool.run({ task: 'too deep' }, { cwd: dir, supportsVision: true });
    expect((out[0] as { text: string }).text).toMatch(/Max sub-agent depth/);
  });

  it('orchestratorToolset includes spawn_subagent until max depth', () => {
    const client = new FakeLLMClient([]);
    const opts = { client, limits: { maxIterations: 5, maxOutputTokens: 100 }, maxDepth: 2 };
    expect(orchestratorToolset({ ...opts, depth: 0 }).some((t) => t.spec.name === 'spawn_subagent')).toBe(true);
    expect(orchestratorToolset({ ...opts, depth: 2 }).some((t) => t.spec.name === 'spawn_subagent')).toBe(false);
  });
});
