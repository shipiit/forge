import Anthropic from '@anthropic-ai/sdk';
import type { ChatRequest, ChatResult, LLMClient, Msg, ProviderId, StopReason, ToolSpec, Usage } from './types.js';
import { clampMaxTokens } from './limits.js';
import { timeoutMs } from './openai.js';

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
    | { type: 'thinking'; thinking: string }
    | { type: 'redacted_thinking'; data?: string }
    | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  >;
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
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

/**
 * Mark the stable request prefix with `cache_control` breakpoints so Anthropic
 * bills a repeated prefix at ~10% of input and serves it faster.
 *
 * The agent loop resends the whole conversation every turn behind an unchanging
 * prefix — the system prompt plus every tool schema — so that prefix is exactly
 * what caching is for. Anthropic caches the tools array up to and including the
 * marked block, so one breakpoint on the LAST tool covers all of them; the system
 * prompt is promoted from a bare string to a single text block so its breakpoint
 * has somewhere to live.
 */
export function applyPromptCaching(
  system: string,
  tools: Array<Record<string, unknown>>,
): { system: unknown; tools: Array<Record<string, unknown>> } {
  const cachedSystem = system
    ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
    : system;
  const cachedTools = tools.length
    ? [...tools.slice(0, -1), { ...tools[tools.length - 1]!, cache_control: { type: 'ephemeral' } }]
    : tools;
  return { system: cachedSystem, tools: cachedTools };
}

/**
 * Put a rolling cache breakpoint at the end of the conversation.
 *
 * Caching the system prompt and tools alone is only half the win: the agent loop
 * resends the ENTIRE growing transcript every turn, and by iteration 20 that
 * transcript dwarfs the static prefix. Marking the last block of the last message
 * makes each turn write a cache entry covering everything up to that point, which
 * the NEXT turn then reads at ~10% of the input rate. Net effect over a long run
 * is close to paying full price only for the newest turn.
 *
 * Anthropic allows four breakpoints; this uses one, leaving system + tools + one
 * spare. Mutates nothing — returns a new array.
 */
export function applyConversationCaching(
  messages: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  if (messages.length === 0) return messages;
  const out = [...messages];
  const last = { ...out[out.length - 1]! };
  const content = last.content;
  if (!Array.isArray(content) || content.length === 0) return messages;

  const blocks = [...content];
  const tail = blocks[blocks.length - 1];
  if (typeof tail !== 'object' || tail === null) return messages;
  blocks[blocks.length - 1] = { ...(tail as object), cache_control: { type: 'ephemeral' } };
  last.content = blocks;
  out[out.length - 1] = last;
  return out;
}

export function mapAnthropicStop(reason: string | null): StopReason {
  if (reason === 'tool_use') return 'tool_use';
  if (reason === 'max_tokens') return 'max_tokens';
  return 'end';
}

export function fromAnthropicResponse(res: AnthropicResponse): ChatResult {
  let text = '';
  let reasoning = '';
  const toolCalls = [];
  for (const block of res.content) {
    if (block.type === 'text') text += block.text;
    else if (block.type === 'thinking') reasoning += block.thinking;
    else if (block.type === 'tool_use') toolCalls.push({ id: block.id, name: block.name, args: block.input });
  }
  const usage: Usage = { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens };
  if (res.usage.cache_read_input_tokens) usage.cacheReadTokens = res.usage.cache_read_input_tokens;
  if (res.usage.cache_creation_input_tokens) usage.cacheWriteTokens = res.usage.cache_creation_input_tokens;
  return {
    text,
    toolCalls,
    usage,
    stopReason: mapAnthropicStop(res.stop_reason),
    ...(reasoning ? { reasoning } : {}),
  };
}

export interface AnthropicOptions {
  apiKey?: string;
  model?: string;
  client?: AnthropicLike;
  /** Mark the stable prefix as cacheable (default true). */
  promptCaching?: boolean;
  /** When > 0, enable extended thinking with this token budget. */
  thinkingBudget?: number;
}

export class AnthropicAdapter implements LLMClient {
  readonly id: ProviderId = 'anthropic';
  readonly supportsVision = true;
  readonly model: string;
  private client: AnthropicLike;
  private promptCaching: boolean;
  private thinkingBudget: number;

  constructor(opts: AnthropicOptions = {}) {
    this.model = opts.model || process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
    this.promptCaching = opts.promptCaching ?? process.env.FORGE_PROMPT_CACHE !== '0';
    this.thinkingBudget = opts.thinkingBudget ?? Number(process.env.FORGE_THINKING_BUDGET || 0);
    // Same reasoning as the OpenAI adapter: without a timeout the SDK default
    // plus its retries turns a stalled endpoint into half an hour of silence.
    this.client =
      opts.client ??
      (new Anthropic({ apiKey: opts.apiKey, timeout: timeoutMs(), maxRetries: 2 }) as unknown as AnthropicLike);
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    let maxTokens = clampMaxTokens(this.model, req.maxTokens);
    const baseTools = toAnthropicTools(req.tools);

    const { system, tools } = this.promptCaching
      ? applyPromptCaching(req.system, baseTools)
      : { system: req.system, tools: baseTools };

    const wire = toAnthropicMessages(req.messages);
    const body: Record<string, unknown> = {
      model: this.model,
      system,
      messages: this.promptCaching ? applyConversationCaching(wire) : wire,
      tools,
    };

    if (this.thinkingBudget > 0) {
      // max_tokens must exceed the thinking budget — the budget is spent from it.
      maxTokens = Math.max(maxTokens, this.thinkingBudget + 1024);
      body.thinking = { type: 'enabled', budget_tokens: this.thinkingBudget };
    }
    body.max_tokens = maxTokens;

    const res = await this.client.messages.create(body);
    return fromAnthropicResponse(res);
  }
}
