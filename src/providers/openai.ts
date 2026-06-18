import OpenAI from 'openai';
import type { ChatRequest, ChatResult, LLMClient, Msg, ProviderId, StopReason, ToolSpec } from './types.js';

const DEFAULT_MODEL = 'gpt-4o';

/** Minimal shape of the OpenAI chat completions call we depend on (for testability). */
export interface OpenAILike {
  chat: {
    completions: {
      create(body: Record<string, unknown>): Promise<OpenAIResponse>;
    };
  };
}

interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string | null;
      tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
    };
    finish_reason: string;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * Flatten normalized messages into OpenAI's message list. Note OpenAI represents
 * each tool result as its own `tool` role message, and assistant tool calls live
 * on the assistant message as `tool_calls`.
 */
export function toOpenAIMessages(system: string, messages: Msg[]): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [{ role: 'system', content: system }];

  for (const m of messages) {
    const toolResults = m.content.filter((p) => p.type === 'tool_result');
    const toolUses = m.content.filter((p) => p.type === 'tool_use');
    const textImage = m.content.filter((p) => p.type === 'text' || p.type === 'image');

    if (m.role === 'assistant') {
      const msg: Record<string, unknown> = { role: 'assistant' };
      const text = textImage.filter((p) => p.type === 'text').map((p) => (p as { text: string }).text).join('');
      msg.content = text || null;
      if (toolUses.length > 0) {
        msg.tool_calls = toolUses.map((p) => {
          const u = p as { id: string; name: string; args: Record<string, unknown> };
          return { id: u.id, type: 'function', function: { name: u.name, arguments: JSON.stringify(u.args) } };
        });
      }
      out.push(msg);
      continue;
    }

    // user role: emit text/image as a user message, then each tool_result as a tool message.
    if (textImage.length > 0) {
      const content = textImage.map((p) => {
        if (p.type === 'text') return { type: 'text', text: p.text };
        return { type: 'image_url', image_url: { url: `data:${p.mime};base64,${p.dataB64}` } };
      });
      out.push({ role: 'user', content });
    }
    for (const tr of toolResults) {
      const r = tr as { toolCallId: string; content: string };
      out.push({ role: 'tool', tool_call_id: r.toolCallId, content: r.content });
    }
  }
  return out;
}

export function toOpenAITools(tools: ToolSpec[]): Array<Record<string, unknown>> {
  return tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

export function mapOpenAIStop(reason: string): StopReason {
  if (reason === 'tool_calls') return 'tool_use';
  if (reason === 'length') return 'max_tokens';
  return 'end';
}

export function fromOpenAIResponse(res: OpenAIResponse): ChatResult {
  const choice = res.choices[0];
  const msg = choice?.message;
  const toolCalls = (msg?.tool_calls ?? []).map((c) => ({
    id: c.id,
    name: c.function.name,
    args: safeJson(c.function.arguments),
  }));
  return {
    text: msg?.content ?? '',
    toolCalls,
    usage: { inputTokens: res.usage?.prompt_tokens ?? 0, outputTokens: res.usage?.completion_tokens ?? 0 },
    stopReason: mapOpenAIStop(choice?.finish_reason ?? 'stop'),
  };
}

function safeJson(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export class OpenAIAdapter implements LLMClient {
  readonly id: ProviderId = 'openai';
  readonly supportsVision = true;
  private client: OpenAILike;
  private model: string;

  constructor(opts: { apiKey?: string; model?: string; client?: OpenAILike } = {}) {
    this.model = opts.model || process.env.OPENAI_MODEL || DEFAULT_MODEL;
    this.client = opts.client ?? (new OpenAI({ apiKey: opts.apiKey }) as unknown as OpenAILike);
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const res = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: req.maxTokens,
      messages: toOpenAIMessages(req.system, req.messages),
      tools: req.tools.length > 0 ? toOpenAITools(req.tools) : undefined,
    });
    return fromOpenAIResponse(res);
  }
}
