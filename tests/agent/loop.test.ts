import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runAgent } from '../../src/agent/loop.js';
import { editToolset } from '../../src/agent/tools/registry.js';
import { FakeLLMClient } from '../../src/providers/fake.js';
import type { ChatResult } from '../../src/providers/types.js';

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-loop-'));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const usage = { inputTokens: 1, outputTokens: 1 };

describe('runAgent', () => {
  it('executes tool calls and finishes on end', async () => {
    const script: ChatResult[] = [
      {
        text: '',
        toolCalls: [{ id: 't1', name: 'write_file', args: { path: 'fix.txt', content: 'PATCHED' } }],
        usage,
        stopReason: 'tool_use',
      },
      {
        text: '',
        toolCalls: [{ id: 't2', name: 'read_file', args: { path: 'fix.txt' } }],
        usage,
        stopReason: 'tool_use',
      },
      { text: 'Done: created fix.txt', toolCalls: [], usage, stopReason: 'end' },
    ];
    const client = new FakeLLMClient(script);
    const result = await runAgent({
      client,
      system: 'sys',
      initialContent: [{ type: 'text', text: 'create fix.txt with PATCHED' }],
      tools: editToolset(),
      limits: { maxIterations: 10, maxOutputTokens: 1000 },
      cwd: dir,
    });

    expect(result.stoppedBy).toBe('end');
    expect(result.finalText).toBe('Done: created fix.txt');
    expect(await fs.readFile(path.join(dir, 'fix.txt'), 'utf8')).toBe('PATCHED');
    expect(result.iterations).toBe(3);
    // The model received the tool result text on its 3rd request.
    const lastReq = client.requests[2];
    const toolResult = lastReq.messages.at(-1)?.content[0];
    expect(toolResult).toMatchObject({ type: 'tool_result' });
  });

  it('stops at maxIterations when the model never ends', async () => {
    const loopTurn: ChatResult = {
      text: '',
      toolCalls: [{ id: 'x', name: 'list_dir', args: { path: '.' } }],
      usage,
      stopReason: 'tool_use',
    };
    const client = new FakeLLMClient([loopTurn, loopTurn, loopTurn]);
    const result = await runAgent({
      client,
      system: 'sys',
      initialContent: [{ type: 'text', text: 'go' }],
      tools: editToolset(),
      limits: { maxIterations: 3, maxOutputTokens: 100 },
      cwd: dir,
    });
    expect(result.stoppedBy).toBe('limit');
    expect(result.iterations).toBe(3);
  });

  it('feeds an error back to the model when a tool throws', async () => {
    const client = new FakeLLMClient([
      {
        text: '',
        toolCalls: [{ id: 'e1', name: 'read_file', args: { path: 'missing.txt' } }],
        usage,
        stopReason: 'tool_use',
      },
      { text: 'handled', toolCalls: [], usage, stopReason: 'end' },
    ]);
    const result = await runAgent({
      client,
      system: 'sys',
      initialContent: [{ type: 'text', text: 'read a missing file' }],
      tools: editToolset(),
      limits: { maxIterations: 5, maxOutputTokens: 100 },
      cwd: dir,
    });
    expect(result.stoppedBy).toBe('end');
    const secondReq = client.requests[1];
    const errPart = secondReq.messages.at(-1)?.content[0] as { isError?: boolean };
    expect(errPart.isError).toBe(true);
  });
});
