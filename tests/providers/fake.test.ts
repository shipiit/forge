import { describe, it, expect } from 'vitest';
import { FakeLLMClient } from '../../src/providers/fake.js';
import type { ChatResult, Msg } from '../../src/providers/types.js';

describe('FakeLLMClient', () => {
  it('returns scripted results in order', async () => {
    const turn1: ChatResult = {
      text: '',
      toolCalls: [{ id: 'c1', name: 'read_file', args: { path: 'a.txt' } }],
      usage: { inputTokens: 10, outputTokens: 5 },
      stopReason: 'tool_use',
    };
    const turn2: ChatResult = {
      text: 'done',
      toolCalls: [],
      usage: { inputTokens: 12, outputTokens: 3 },
      stopReason: 'end',
    };
    const client = new FakeLLMClient([turn1, turn2]);
    expect(client.id).toBe('fake');
    expect(client.supportsVision).toBe(true);

    const messages: Msg[] = [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }];
    const r1 = await client.chat({ system: 's', messages, tools: [], maxTokens: 100 });
    expect(r1.stopReason).toBe('tool_use');
    expect(r1.toolCalls[0]?.name).toBe('read_file');

    // a follow-up turn carrying a tool_result is accepted
    messages.push({ role: 'user', content: [{ type: 'tool_result', toolCallId: 'c1', content: 'FILE BODY' }] });
    const r2 = await client.chat({ system: 's', messages, tools: [], maxTokens: 100 });
    expect(r2.stopReason).toBe('end');
    expect(r2.text).toBe('done');
  });

  it('throws when the script is exhausted', async () => {
    const client = new FakeLLMClient([]);
    await expect(
      client.chat({ system: 's', messages: [], tools: [], maxTokens: 10 }),
    ).rejects.toThrow(/exhausted/i);
  });

  it('records the requests it received', async () => {
    const client = new FakeLLMClient([
      { text: 'ok', toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 }, stopReason: 'end' },
    ]);
    await client.chat({ system: 'SYS', messages: [], tools: [], maxTokens: 7 });
    expect(client.requests).toHaveLength(1);
    expect(client.requests[0]?.system).toBe('SYS');
  });
});
