import OpenAI from 'openai';
import type { ChatRequest, ChatResult, LLMClient, Msg, ProviderId, StopReason, ToolSpec, Usage } from './types.js';

const DEFAULT_MODEL = 'gpt-4o';

/**
 * Models that natively reason before answering. They take `reasoning_effort`,
 * and — importantly — reject `max_tokens`, requiring `max_completion_tokens`
 * instead. Sending the wrong one is a hard 400.
 */
const REASONING_MODEL_PATTERNS = [/^o1(-|$)/, /^o3(-|$)/, /^o4(-|$)/, /^gpt-5/, /^deepseek-r1/];

export function isReasoningModel(model: string): boolean {
  const m = (model || '').toLowerCase();
  return REASONING_MODEL_PATTERNS.some((p) => p.test(m));
}

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
      reasoning_content?: string | null;
      tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
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
      const text = textImage
        .filter((p) => p.type === 'text')
        .map((p) => (p as { text: string }).text)
        .join('');
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
  const usage: Usage = {
    inputTokens: res.usage?.prompt_tokens ?? 0,
    outputTokens: res.usage?.completion_tokens ?? 0,
  };
  // OpenAI caches prompts automatically — no cache_control needed — and reports
  // the cached portion here, so it can be billed at the discounted rate.
  const cached = res.usage?.prompt_tokens_details?.cached_tokens;
  if (cached) usage.cacheReadTokens = cached;
  const reasoning = msg?.reasoning_content ?? '';
  return {
    text: msg?.content ?? '',
    toolCalls,
    usage,
    stopReason: mapOpenAIStop(choice?.finish_reason ?? 'stop'),
    ...(reasoning ? { reasoning } : {}),
  };
}

function safeJson(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export interface OpenAIOptions {
  apiKey?: string;
  model?: string;
  client?: OpenAILike;
  /** Base URL for OpenAI-compatible endpoints (Groq, Together, Ollama, gateways). */
  baseURL?: string;
  /** 'low' | 'medium' | 'high' — only sent for reasoning-capable models. */
  reasoningEffort?: string;
  /** Provider id to report; the compatible providers reuse this adapter. */
  providerId?: ProviderId;
  /** Whether the configured model accepts images. */
  supportsVision?: boolean;
}

export class OpenAIAdapter implements LLMClient {
  readonly id: ProviderId;
  readonly supportsVision: boolean;
  readonly model: string;
  private client: OpenAILike;
  private reasoningEffort?: string;

  constructor(opts: OpenAIOptions = {}) {
    this.id = opts.providerId ?? 'openai';
    this.model = opts.model || process.env.OPENAI_MODEL || DEFAULT_MODEL;
    this.supportsVision = opts.supportsVision ?? true;
    this.reasoningEffort =
      opts.reasoningEffort ||
      process.env.FORGE_REASONING_EFFORT ||
      (isReasoningModel(this.model) ? 'medium' : undefined);
    this.client =
      opts.client ??
      (new OpenAI({ apiKey: opts.apiKey, ...(opts.baseURL ? { baseURL: opts.baseURL } : {}) }) as unknown as OpenAILike);
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const reasoning = isReasoningModel(this.model);
    const body: Record<string, unknown> = {
      model: this.model,
      messages: toOpenAIMessages(req.system, req.messages),
      tools: req.tools.length > 0 ? toOpenAITools(req.tools) : undefined,
    };
    // Reasoning models reject `max_tokens` outright and want the newer field.
    if (reasoning) {
      body.max_completion_tokens = req.maxTokens;
      if (this.reasoningEffort) body.reasoning_effort = this.reasoningEffort;
    } else {
      body.max_tokens = req.maxTokens;
    }
    const res = await this.client.chat.completions.create(body);
    return fromOpenAIResponse(res);
  }
}
