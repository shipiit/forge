import { describe, it, expect } from 'vitest';
import type { Msg } from '../../src/providers/types.js';
import { compactMessages, estimateChars, KEEP_RECENT_MESSAGES } from '../../src/agent/compaction.js';
import { applyConversationCaching, AnthropicAdapter } from '../../src/providers/anthropic.js';

function bigToolResult(id: string, size: number): Msg {
  return { role: 'user', content: [{ type: 'tool_result', toolCallId: id, content: 'x'.repeat(size) }] };
}

function transcript(turns: number, size: number): Msg[] {
  const out: Msg[] = [{ role: 'user', content: [{ type: 'text', text: 'task' }] }];
  for (let i = 0; i < turns; i++) {
    out.push({ role: 'assistant', content: [{ type: 'tool_use', id: `t${i}`, name: 'read_file', args: {} }] });
    out.push(bigToolResult(`t${i}`, size));
  }
  return out;
}

describe('conversation compaction', () => {
  it('leaves a small transcript completely untouched', () => {
    const msgs = transcript(2, 100);
    const res = compactMessages(msgs);
    expect(res.compacted).toBe(false);
    expect(res.messages).toBe(msgs); // same reference — cached prefix preserved
  });

  it('compacts once the transcript is genuinely large', () => {
    const res = compactMessages(transcript(30, 10_000));
    expect(res.compacted).toBe(true);
    expect(res.savedChars).toBeGreaterThan(100_000);
  });

  it('keeps the most recent messages verbatim', () => {
    const msgs = transcript(30, 10_000);
    const res = compactMessages(msgs);
    const tail = res.messages.slice(-KEEP_RECENT_MESSAGES);
    for (const m of tail) {
      for (const p of m.content) {
        if (p.type === 'tool_result') expect(p.content).not.toContain('elided');
      }
    }
  });

  it('preserves every tool_result id so the history stays valid', () => {
    const msgs = transcript(30, 10_000);
    const ids = (list: Msg[]) =>
      list.flatMap((m) => m.content.filter((p) => p.type === 'tool_result').map((p: any) => p.toolCallId));
    expect(ids(compactMessages(msgs).messages)).toEqual(ids(msgs));
  });

  it('preserves message count and roles', () => {
    const msgs = transcript(30, 10_000);
    const res = compactMessages(msgs);
    expect(res.messages).toHaveLength(msgs.length);
    expect(res.messages.map((m) => m.role)).toEqual(msgs.map((m) => m.role));
  });

  it('drops old image payloads, which dominate a transcript', () => {
    const msgs: Msg[] = [
      { role: 'user', content: [{ type: 'image', mime: 'image/png', dataB64: 'A'.repeat(200_000) }] },
      ...transcript(10, 100).slice(1),
    ];
    const res = compactMessages(msgs);
    expect(res.compacted).toBe(true);
    expect(JSON.stringify(res.messages)).not.toContain('A'.repeat(1000));
  });

  it('keeps short tool results even when compacting', () => {
    const msgs = [...transcript(30, 10_000), bigToolResult('short', 50)];
    const res = compactMessages(msgs);
    const short = res.messages.find((m) =>
      m.content.some((p) => p.type === 'tool_result' && p.toolCallId === 'short'),
    );
    expect((short!.content[0] as any).content).toBe('x'.repeat(50));
  });

  it('estimates size across every content type', () => {
    expect(
      estimateChars([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'abc' },
            { type: 'tool_result', toolCallId: 'x', content: 'de' },
          ],
        },
      ]),
    ).toBe(5);
  });
});

describe('conversation prompt caching', () => {
  it('marks the last block of the last message', () => {
    const out = applyConversationCaching([
      { role: 'user', content: [{ type: 'text', text: 'a' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'b' }] },
    ]);
    expect((out[1]!.content as any[])[0].cache_control).toEqual({ type: 'ephemeral' });
    expect((out[0]!.content as any[])[0].cache_control).toBeUndefined();
  });

  it('does not mutate the input', () => {
    const input = [{ role: 'user', content: [{ type: 'text', text: 'a' }] }];
    applyConversationCaching(input);
    expect((input[0]!.content as any[])[0].cache_control).toBeUndefined();
  });

  it('is a no-op on an empty conversation', () => {
    expect(applyConversationCaching([])).toEqual([]);
  });

  it('is applied end-to-end when caching is on, and skipped when off', async () => {
    const capture = (promptCaching: boolean) => {
      let body: any;
      const adapter = new AnthropicAdapter({
        promptCaching,
        client: {
          messages: {
            async create(b: any) {
              body = b;
              return { content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } };
            },
          },
        },
      } as any);
      return { adapter, body: () => body };
    };

    const on = capture(true);
    await on.adapter.chat({
      system: 'S',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      tools: [],
      maxTokens: 100,
    });
    expect(on.body().messages[0].content[0].cache_control).toEqual({ type: 'ephemeral' });

    const off = capture(false);
    await off.adapter.chat({
      system: 'S',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      tools: [],
      maxTokens: 100,
    });
    expect(off.body().messages[0].content[0].cache_control).toBeUndefined();
  });
});
