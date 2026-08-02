/**
 * Provider-agnostic LLM types. Every provider adapter (Anthropic, OpenAI, Gemini,
 * Vertex, Bedrock, and the OpenAI-compatible family) normalizes to/from these
 * shapes so the agent loop never knows which provider is behind it. This file is
 * the single source of truth for the message/tool contract used across the whole
 * project.
 */

/** A piece of message content. Multimodal: text, image, a tool call, or a tool result. */
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mime: string; dataB64: string }
  | { type: 'tool_use'; id: string; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; toolCallId: string; content: string; isError?: boolean };

export interface Msg {
  role: 'user' | 'assistant';
  content: ContentPart[];
}

/** A tool the model may call. `parameters` is a JSON Schema object. */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: object;
}

/** A single tool invocation requested by the model. */
export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export type StopReason = 'end' | 'tool_use' | 'max_tokens';

/**
 * Token accounting for one call. Cache fields are only present on providers that
 * report them (Anthropic-family prompt caching, OpenAI automatic caching); they
 * are billed at different rates than fresh input tokens — see util/cost.ts.
 */
export interface Usage {
  inputTokens: number;
  outputTokens: number;
  /** Input tokens served from a warm cache (billed at a large discount). */
  cacheReadTokens?: number;
  /** Input tokens written into the cache (billed at a premium, once). */
  cacheWriteTokens?: number;
}

export interface ChatResult {
  text: string;
  toolCalls: ToolCall[];
  usage: Usage;
  stopReason: StopReason;
  /** Extended-thinking / reasoning text, when the model emits it. */
  reasoning?: string;
}

export interface ChatRequest {
  system: string;
  messages: Msg[];
  tools: ToolSpec[];
  maxTokens: number;
}

export type ProviderId =
  | 'anthropic'
  | 'openai'
  | 'vertex'
  | 'bedrock'
  | 'gemini'
  | 'groq'
  | 'together'
  | 'ollama'
  | 'openai-compatible'
  | 'fake';

export interface LLMClient {
  readonly id: ProviderId;
  /** Whether the configured model can accept image content parts. */
  readonly supportsVision: boolean;
  /** The resolved model id, for cost attribution and logging. */
  readonly model: string;
  chat(req: ChatRequest): Promise<ChatResult>;
}
