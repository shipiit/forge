import { describe, it, expect } from 'vitest';
import type { Msg, ToolSpec } from '../../src/providers/types.js';
import { AnthropicAdapter, fromAnthropicResponse } from '../../src/providers/anthropic.js';
import { OpenAIAdapter, isReasoningModel, fromOpenAIResponse } from '../../src/providers/openai.js';
import { GeminiAdapter, fromGeminiResponse } from '../../src/providers/gemini.js';
import { clampMaxTokens } from '../../src/providers/limits.js';

const messages: Msg[] = [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }];
const tools: ToolSpec[] = [{ name: 'a', description: 'a', parameters: { type: 'object' } }];

function anthropicWith(opts: Record<string, unknown>) {
  let captured: any;
  const adapter = new AnthropicAdapter({
    ...opts,
    client: {
      messages: {
        async create(body: any) {
          captured = body;
          return { content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } };
        },
      },
    },
  } as any);
  return { adapter, captured: () => captured };
}

describe('Anthropic extended thinking', () => {
  it('is off by default', async () => {
    const { adapter, captured } = anthropicWith({});
    await adapter.chat({ system: 'S', messages, tools, maxTokens: 1000 });
    expect(captured().thinking).toBeUndefined();
  });

  it('sends a thinking budget when configured', async () => {
    const { adapter, captured } = anthropicWith({ thinkingBudget: 2048 });
    await adapter.chat({ system: 'S', messages, tools, maxTokens: 4000 });
    expect(captured().thinking).toEqual({ type: 'enabled', budget_tokens: 2048 });
  });

  it('raises max_tokens above the thinking budget', async () => {
    // Thinking tokens are spent out of max_tokens, so a budget larger than the
    // requested output cap would be rejected by the API.
    const { adapter, captured } = anthropicWith({ thinkingBudget: 8000 });
    await adapter.chat({ system: 'S', messages, tools, maxTokens: 1000 });
    expect(captured().max_tokens).toBeGreaterThan(8000);
  });

  it('extracts thinking blocks as reasoning, not answer text', () => {
    const res = fromAnthropicResponse({
      content: [
        { type: 'thinking', thinking: 'let me think' },
        { type: 'text', text: 'the answer' },
      ],
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    expect(res.text).toBe('the answer');
    expect(res.reasoning).toBe('let me think');
  });
});

describe('OpenAI reasoning models', () => {
  it('detects reasoning-capable model families', () => {
    for (const m of ['o1', 'o1-mini', 'o3', 'o3-mini', 'o4-mini', 'gpt-5', 'gpt-5-mini']) {
      expect(isReasoningModel(m)).toBe(true);
    }
    for (const m of ['gpt-4o', 'gpt-4.1', 'gpt-4o-mini']) {
      expect(isReasoningModel(m)).toBe(false);
    }
  });

  function openaiWith(model: string) {
    let captured: any;
    const adapter = new OpenAIAdapter({
      model,
      client: {
        chat: {
          completions: {
            async create(body: any) {
              captured = body;
              return { choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] };
            },
          },
        },
      },
    });
    return { adapter, captured: () => captured };
  }

  it('uses max_completion_tokens (not max_tokens) for reasoning models', async () => {
    const { adapter, captured } = openaiWith('o3-mini');
    await adapter.chat({ system: 'S', messages, tools, maxTokens: 999 });
    expect(captured().max_completion_tokens).toBe(999);
    expect(captured().max_tokens).toBeUndefined();
    expect(captured().reasoning_effort).toBe('medium');
  });

  it('uses max_tokens and no reasoning_effort for standard models', async () => {
    const { adapter, captured } = openaiWith('gpt-4o');
    await adapter.chat({ system: 'S', messages, tools, maxTokens: 999 });
    expect(captured().max_tokens).toBe(999);
    expect(captured().max_completion_tokens).toBeUndefined();
    expect(captured().reasoning_effort).toBeUndefined();
  });

  it('passes through reasoning_content when present', () => {
    const res = fromOpenAIResponse({
      choices: [{ message: { content: 'ok', reasoning_content: 'thought' }, finish_reason: 'stop' }],
    });
    expect(res.reasoning).toBe('thought');
  });
});

describe('Gemini thinking', () => {
  it('separates thought parts from answer text', () => {
    const res = fromGeminiResponse({
      candidates: [
        { content: { parts: [{ text: 'thinking...', thought: true }, { text: 'answer' }] }, finishReason: 'STOP' },
      ],
    });
    expect(res.text).toBe('answer');
    expect(res.reasoning).toBe('thinking...');
  });

  it('sends thinkingConfig only when a budget is set', async () => {
    let captured: any;
    const withBudget = new GeminiAdapter({
      thinkingBudget: 1024,
      client: {
        async generateContent(body: any) {
          captured = body;
          return { candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }] };
        },
      },
    });
    await withBudget.chat({ system: 'S', messages, tools, maxTokens: 100 });
    expect(captured.config.thinkingConfig).toEqual({ thinkingBudget: 1024, includeThoughts: true });

    const noBudget = new GeminiAdapter({
      thinkingBudget: 0,
      client: {
        async generateContent(body: any) {
          captured = body;
          return { candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }] };
        },
      },
    });
    await noBudget.chat({ system: 'S', messages, tools, maxTokens: 100 });
    expect(captured.config.thinkingConfig).toBeUndefined();
  });
});

describe('per-model output caps', () => {
  it('clamps models with a known hard ceiling', () => {
    expect(clampMaxTokens('anthropic.claude-3-5-sonnet-20241022-v2:0', 16384)).toBe(8192);
    expect(clampMaxTokens('claude-3-5-haiku-latest', 16384)).toBe(8192);
    expect(clampMaxTokens('claude-3-opus-20240229', 16384)).toBe(4096);
  });

  it('passes through budgets already under the cap', () => {
    expect(clampMaxTokens('anthropic.claude-3-5-sonnet-20241022-v2:0', 4000)).toBe(4000);
  });

  it('leaves unknown models at the requested budget', () => {
    expect(clampMaxTokens('claude-opus-4-8', 16384)).toBe(16384);
    expect(clampMaxTokens('some-future-model', 16384)).toBe(16384);
  });
});
