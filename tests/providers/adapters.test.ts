import { describe, it, expect } from 'vitest';
import type { Msg, ToolSpec } from '../../src/providers/types.js';
import {
  AnthropicAdapter,
  toAnthropicMessages,
  fromAnthropicResponse,
  mapAnthropicStop,
} from '../../src/providers/anthropic.js';
import {
  VertexAdapter,
  toGeminiContents,
  fromGeminiResponse,
} from '../../src/providers/vertex.js';
import {
  OpenAIAdapter,
  toOpenAIMessages,
  fromOpenAIResponse,
} from '../../src/providers/openai.js';
import {
  BedrockAdapter,
  toBedrockMessages,
  fromBedrockResponse,
} from '../../src/providers/bedrock.js';

const tools: ToolSpec[] = [{ name: 'read_file', description: 'read', parameters: { type: 'object' } }];

// A representative conversation exercising text, image, tool_use, tool_result.
const convo: Msg[] = [
  { role: 'user', content: [{ type: 'text', text: 'fix it' }, { type: 'image', mime: 'image/png', dataB64: 'AAAA' }] },
  { role: 'assistant', content: [{ type: 'tool_use', id: 'c1', name: 'read_file', args: { path: 'a.ts' } }] },
  { role: 'user', content: [{ type: 'tool_result', toolCallId: 'c1', content: 'file body' }] },
];

describe('Anthropic adapter', () => {
  it('maps messages incl. image, tool_use, tool_result', () => {
    const out = toAnthropicMessages(convo) as any[];
    expect(out[0].content[1]).toMatchObject({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } });
    expect(out[1].content[0]).toMatchObject({ type: 'tool_use', id: 'c1', name: 'read_file' });
    expect(out[2].content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'c1', content: 'file body' });
  });

  it('parses a response into text + toolCalls + stop reason', () => {
    const res = fromAnthropicResponse({
      content: [
        { type: 'text', text: 'hi' },
        { type: 'tool_use', id: 'x', name: 'read_file', input: { path: 'b' } },
      ],
      stop_reason: 'tool_use',
      usage: { input_tokens: 3, output_tokens: 4 },
    });
    expect(res.text).toBe('hi');
    expect(res.toolCalls).toEqual([{ id: 'x', name: 'read_file', args: { path: 'b' } }]);
    expect(res.stopReason).toBe('tool_use');
    expect(res.usage).toEqual({ inputTokens: 3, outputTokens: 4 });
  });

  it('maps stop reasons', () => {
    expect(mapAnthropicStop('end_turn')).toBe('end');
    expect(mapAnthropicStop('max_tokens')).toBe('max_tokens');
  });

  it('round-trips through chat() with an injected client', async () => {
    let captured: any;
    const adapter = new AnthropicAdapter({
      client: {
        messages: {
          async create(body) {
            captured = body;
            return { content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } };
          },
        },
      },
    });
    const res = await adapter.chat({ system: 'S', messages: convo, tools, maxTokens: 100 });
    expect(captured.system).toBe('S');
    expect(captured.tools[0]).toMatchObject({ name: 'read_file', input_schema: { type: 'object' } });
    expect(res.text).toBe('ok');
  });
});

describe('Vertex Gemini adapter', () => {
  it('uses model role and resolves tool_result name by id', () => {
    const out = toGeminiContents(convo) as any[];
    expect(out[1].role).toBe('model');
    expect(out[1].parts[0]).toMatchObject({ functionCall: { name: 'read_file' } });
    expect(out[2].parts[0]).toMatchObject({ functionResponse: { name: 'read_file' } });
    expect(out[0].parts[1]).toMatchObject({ inlineData: { mimeType: 'image/png', data: 'AAAA' } });
  });

  it('parses functionCall responses with synthesized ids', () => {
    const res = fromGeminiResponse({
      candidates: [{ content: { parts: [{ functionCall: { name: 'read_file', args: { path: 'z' } } }] } }],
      usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 6 },
    });
    expect(res.toolCalls[0]).toMatchObject({ name: 'read_file', args: { path: 'z' } });
    expect(res.stopReason).toBe('tool_use');
    expect(res.usage).toEqual({ inputTokens: 5, outputTokens: 6 });
  });

  it('round-trips through chat() with an injected model (@google/genai shape)', async () => {
    let body: any;
    const adapter = new VertexAdapter({
      client: {
        async generateContent(req) {
          body = req;
          return { candidates: [{ content: { parts: [{ text: 'done' }] }, finishReason: 'STOP' }] };
        },
      },
    });
    const res = await adapter.chat({ system: 'S', messages: convo, tools, maxTokens: 50 });
    expect(body.model).toBeDefined();
    expect(body.config.systemInstruction).toBe('S');
    expect(body.config.tools[0].functionDeclarations[0].name).toBe('read_file');
    expect(res.text).toBe('done');
    expect(res.stopReason).toBe('end');
  });
});

describe('OpenAI adapter', () => {
  it('flattens tool results into tool-role messages and emits a system message', () => {
    const out = toOpenAIMessages('SYS', convo) as any[];
    expect(out[0]).toEqual({ role: 'system', content: 'SYS' });
    const toolMsg = out.find((m) => m.role === 'tool');
    expect(toolMsg).toMatchObject({ tool_call_id: 'c1', content: 'file body' });
    const asst = out.find((m) => m.role === 'assistant');
    expect(asst.tool_calls[0]).toMatchObject({ id: 'c1', function: { name: 'read_file' } });
  });

  it('parses tool_calls and stop reason', () => {
    const res = fromOpenAIResponse({
      choices: [{ message: { content: null, tool_calls: [{ id: 'q', function: { name: 'read_file', arguments: '{"path":"p"}' } }] }, finish_reason: 'tool_calls' }],
      usage: { prompt_tokens: 2, completion_tokens: 3 },
    });
    expect(res.toolCalls[0]).toEqual({ id: 'q', name: 'read_file', args: { path: 'p' } });
    expect(res.stopReason).toBe('tool_use');
  });

  it('round-trips through chat() with an injected client', async () => {
    let body: any;
    const adapter = new OpenAIAdapter({
      client: {
        chat: {
          completions: {
            async create(b) {
              body = b;
              return { choices: [{ message: { content: 'hello' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
            },
          },
        },
      },
    });
    const res = await adapter.chat({ system: 'S', messages: convo, tools, maxTokens: 10 });
    expect(body.tools[0].function.name).toBe('read_file');
    expect(res.text).toBe('hello');
  });
});

describe('Bedrock adapter', () => {
  it('maps messages incl. image bytes, toolUse, toolResult', () => {
    const out = toBedrockMessages(convo) as any[];
    expect(out[0].content[1].image.format).toBe('png');
    expect(Buffer.isBuffer(out[0].content[1].image.source.bytes)).toBe(true);
    expect(out[1].content[0]).toMatchObject({ toolUse: { toolUseId: 'c1', name: 'read_file' } });
    expect(out[2].content[0]).toMatchObject({ toolResult: { toolUseId: 'c1', status: 'success' } });
  });

  it('parses Converse output', () => {
    const res = fromBedrockResponse({
      output: { message: { content: [{ text: 'r' }, { toolUse: { toolUseId: 't', name: 'read_file', input: { path: 'a' } } }] } },
      stopReason: 'tool_use',
      usage: { inputTokens: 7, outputTokens: 8 },
    });
    expect(res.text).toBe('r');
    expect(res.toolCalls[0]).toEqual({ id: 't', name: 'read_file', args: { path: 'a' } });
    expect(res.usage).toEqual({ inputTokens: 7, outputTokens: 8 });
  });

  it('round-trips through chat() with an injected client', async () => {
    const adapter = new BedrockAdapter({
      client: {
        async send() {
          return { output: { message: { content: [{ text: 'bedrock-ok' }] } }, stopReason: 'end_turn', usage: { inputTokens: 1, outputTokens: 1 } };
        },
      },
    });
    const res = await adapter.chat({ system: 'S', messages: convo, tools, maxTokens: 10 });
    expect(res.text).toBe('bedrock-ok');
    expect(res.stopReason).toBe('end');
  });
});
