import { describe, it, expect } from 'vitest';
import type { Msg, ToolSpec } from '../../src/providers/types.js';
import { AnthropicAdapter, applyPromptCaching, fromAnthropicResponse } from '../../src/providers/anthropic.js';
import {
  BedrockAdapter,
  fromBedrockResponse,
  supportsBedrockCaching,
  toBedrockSystem,
  toBedrockToolConfig,
} from '../../src/providers/bedrock.js';
import { fromOpenAIResponse } from '../../src/providers/openai.js';
import { fromGeminiResponse } from '../../src/providers/gemini.js';

const messages: Msg[] = [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }];
const tools: ToolSpec[] = [
  { name: 'a', description: 'a', parameters: { type: 'object' } },
  { name: 'b', description: 'b', parameters: { type: 'object' } },
];

describe('Anthropic prompt caching', () => {
  it('marks the system prompt and only the LAST tool', () => {
    const out = applyPromptCaching('sys', [{ name: 'a' }, { name: 'b' }]);
    expect(out.system).toEqual([{ type: 'text', text: 'sys', cache_control: { type: 'ephemeral' } }]);
    expect(out.tools[0]).toEqual({ name: 'a' });
    expect(out.tools[1]).toEqual({ name: 'b', cache_control: { type: 'ephemeral' } });
  });

  it('leaves an empty system prompt and empty tool list alone', () => {
    const out = applyPromptCaching('', []);
    expect(out.system).toBe('');
    expect(out.tools).toEqual([]);
  });

  it('does not mutate the caller-supplied tool array', () => {
    const original = [{ name: 'a' }, { name: 'b' }];
    applyPromptCaching('sys', original);
    expect(original[1]).toEqual({ name: 'b' });
  });

  it('surfaces cache read/write tokens in usage', () => {
    const res = fromAnthropicResponse({
      content: [{ type: 'text', text: 'ok' }],
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_read_input_tokens: 900,
        cache_creation_input_tokens: 100,
      },
    });
    expect(res.usage).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: 900,
      cacheWriteTokens: 100,
    });
  });

  it('omits cache fields entirely when the provider reports none', () => {
    const res = fromAnthropicResponse({
      content: [{ type: 'text', text: 'ok' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    expect(res.usage.cacheReadTokens).toBeUndefined();
    expect(res.usage.cacheWriteTokens).toBeUndefined();
  });
});

describe('Bedrock prompt caching', () => {
  it('only enables caching for Anthropic-family models', () => {
    expect(supportsBedrockCaching('anthropic.claude-3-5-sonnet-20241022-v2:0')).toBe(true);
    expect(supportsBedrockCaching('meta.llama3-70b-instruct-v1:0')).toBe(false);
  });

  it('appends a cachePoint block to system and tools when enabled', () => {
    expect(toBedrockSystem('sys', { caching: true })).toEqual([
      { text: 'sys' },
      { cachePoint: { type: 'default' } },
    ]);
    const cfg = toBedrockToolConfig(tools, { caching: true }) as any;
    expect(cfg.tools).toHaveLength(3);
    expect(cfg.tools[2]).toEqual({ cachePoint: { type: 'default' } });
  });

  it('omits cachePoint when disabled', () => {
    expect(toBedrockSystem('sys')).toEqual([{ text: 'sys' }]);
    const cfg = toBedrockToolConfig(tools) as any;
    expect(cfg.tools).toHaveLength(2);
  });

  it('does not send cachePoint for a non-Anthropic model', async () => {
    let sent: any;
    const adapter = new BedrockAdapter({
      model: 'meta.llama3-70b-instruct-v1:0',
      promptCaching: true,
      client: {
        async send(cmd: any) {
          sent = cmd.input;
          return { output: { message: { content: [{ text: 'ok' }] } }, stopReason: 'end_turn' };
        },
      },
    });
    await adapter.chat({ system: 'S', messages, tools, maxTokens: 100 });
    expect(sent.system).toEqual([{ text: 'S' }]);
    expect(sent.toolConfig.tools).toHaveLength(2);
  });

  it('surfaces Bedrock cache token usage', () => {
    const res = fromBedrockResponse({
      output: { message: { content: [{ text: 'ok' }] } },
      stopReason: 'end_turn',
      usage: { inputTokens: 3, outputTokens: 4, cacheReadInputTokens: 500, cacheWriteInputTokens: 20 },
    });
    expect(res.usage.cacheReadTokens).toBe(500);
    expect(res.usage.cacheWriteTokens).toBe(20);
  });
});

describe('automatic caching on other providers', () => {
  it('reads OpenAI cached prompt tokens', () => {
    const res = fromOpenAIResponse({
      choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 100, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 80 } },
    });
    expect(res.usage.cacheReadTokens).toBe(80);
  });

  it('reads Gemini cached content tokens', () => {
    const res = fromGeminiResponse({
      candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 10, cachedContentTokenCount: 60 },
    });
    expect(res.usage.cacheReadTokens).toBe(60);
  });
});
