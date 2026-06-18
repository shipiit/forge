import Anthropic from '@anthropic-ai/sdk';
import type { ChatRequest, ChatResult, LLMClient, Msg, ProviderId, StopReason, ToolSpec } from './types.js';

const DEFAULT_MODEL = 'claude-opus-4-8';

/** Minimal shape of the Anthropic Messages API we depend on (for testability). */
export interface AnthropicLike {
  messages: {
    create(body: Record<string, unknown>): Promise<AnthropicResponse>;
  };
}

interface AnthropicResponse {
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  >;
  stop_reason: string | null;
  usage: { input_tokens: number; output_tokens: number };
}

/** Map our normalized messages to Anthropic's MessageParam content blocks. */
export function toAnthropicMessages(messages: Msg[]): Array<Record<string, unknown>> {
  return messages.map((m) => ({
    role: m.role,
    content: m.content.map((part) => {
      switch (part.type) {
        case 'text':
          return { type: 'text', text: part.text };
        case 'image':
          return { type: 'image', source: { type: 'base64', media_type: part.mime, data: part.dataB64 } };
        case 'tool_use':
          return { type: 'tool_use', id: part.id, name: part.name, input: part.args };
        case 'tool_result':
          return {
            type: 'tool_result',
            tool_use_id: part.toolCallId,
            content: part.content,
            ...(part.isError ? { is_error: true } : {}),
          };
      }
    }),
  }));
}

export function toAnthropicTools(tools: ToolSpec[]): Array<Record<string, unknown>> {
  return tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
}

export function mapAnthropicStop(reason: string | null): StopReason {
  if (reason === 'tool_use') return 'tool_use';
  if (reason === 'max_tokens') return 'max_tokens';
  return 'end';
}

export function fromAnthropicResponse(res: AnthropicResponse): ChatResult {
  let text = '';
  const toolCalls = [];
  for (const block of res.content) {
    if (block.type === 'text') text += block.text;
    else if (block.type === 'tool_use') toolCalls.push({ id: block.id, name: block.name, args: block.input });
  }
  return {
    text,
    toolCalls,
    usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens },
    stopReason: mapAnthropicStop(res.stop_reason),
  };
}

export class AnthropicAdapter implements LLMClient {
  readonly id: ProviderId = 'anthropic';
  readonly supportsVision = true;
  private client: AnthropicLike;
  private model: string;

  constructor(opts: { apiKey?: string; model?: string; client?: AnthropicLike } = {}) {
    this.model = opts.model || DEFAULT_MODEL;
    this.client = opts.client ?? (new Anthropic({ apiKey: opts.apiKey }) as unknown as AnthropicLike);
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: toAnthropicMessages(req.messages),
      tools: toAnthropicTools(req.tools),
    });
    return fromAnthropicResponse(res);
  }
}
