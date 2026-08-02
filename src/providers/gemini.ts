import { GoogleGenAI } from '@google/genai';
import type { ChatRequest, ChatResult, LLMClient, Msg, ProviderId, StopReason, ToolSpec, Usage } from './types.js';

/**
 * Shared Gemini wire-format handling. Both the Vertex AI adapter (service-account
 * / ADC auth) and the direct Gemini Developer API adapter (API-key auth) speak the
 * exact same `generateContent` protocol, so all mapping lives here and the two
 * adapters differ only in how they construct a client.
 */

const DEFAULT_MODEL = 'gemini-2.5-pro';

/** Minimal shape of the @google/genai generateContent call we depend on (for testability). */
export interface GeminiLike {
  generateContent(req: Record<string, unknown>): Promise<GeminiResponse>;
}

export interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<GeminiPart> };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    cachedContentTokenCount?: number;
    thoughtsTokenCount?: number;
  };
}

export type GeminiPart =
  | { text: string; thought?: boolean }
  | { inlineData: { mimeType: string; data: string } }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

/**
 * Convert normalized messages to Gemini `contents`. Gemini identifies tool
 * results by function NAME, not by an id, so we track id→name as we walk the
 * messages and look the name up when emitting a functionResponse.
 */
export function toGeminiContents(messages: Msg[]): Array<Record<string, unknown>> {
  const idToName = new Map<string, string>();
  return messages.map((m) => {
    const parts = m.content.map((part) => {
      switch (part.type) {
        case 'text':
          return { text: part.text };
        case 'image':
          return { inlineData: { mimeType: part.mime, data: part.dataB64 } };
        case 'tool_use':
          idToName.set(part.id, part.name);
          return { functionCall: { name: part.name, args: part.args } };
        case 'tool_result':
          return {
            functionResponse: {
              name: idToName.get(part.toolCallId) ?? part.toolCallId,
              response: { content: part.content, ...(part.isError ? { error: true } : {}) },
            },
          };
      }
    });
    return { role: m.role === 'assistant' ? 'model' : 'user', parts };
  });
}

export function toGeminiTools(tools: ToolSpec[]): Array<Record<string, unknown>> {
  if (tools.length === 0) return [];
  return [
    {
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    },
  ];
}

export function mapGeminiStop(reason: string | undefined, hasToolCall: boolean): StopReason {
  if (hasToolCall) return 'tool_use';
  if (reason === 'MAX_TOKENS') return 'max_tokens';
  return 'end';
}

export function fromGeminiResponse(res: GeminiResponse): ChatResult {
  const cand = res.candidates?.[0];
  const parts = cand?.content?.parts ?? [];
  let text = '';
  let reasoning = '';
  const toolCalls = [];
  let i = 0;
  for (const part of parts) {
    if ('text' in part) {
      // Thinking models mark reasoning parts with `thought: true`.
      if (part.thought) reasoning += part.text;
      else text += part.text;
    } else if ('functionCall' in part) {
      toolCalls.push({
        id: `${part.functionCall.name}-${i++}`,
        name: part.functionCall.name,
        args: part.functionCall.args ?? {},
      });
    }
  }
  const meta = res.usageMetadata ?? {};
  const usage: Usage = {
    inputTokens: meta.promptTokenCount ?? 0,
    outputTokens: meta.candidatesTokenCount ?? 0,
  };
  if (meta.cachedContentTokenCount) usage.cacheReadTokens = meta.cachedContentTokenCount;
  return {
    text,
    toolCalls,
    usage,
    stopReason: mapGeminiStop(cand?.finishReason, toolCalls.length > 0),
    ...(reasoning ? { reasoning } : {}),
  };
}

/** Build the `generateContent` request body shared by both Gemini adapters. */
export function buildGeminiRequest(model: string, req: ChatRequest, opts: { thinkingBudget?: number } = {}) {
  const config: Record<string, unknown> = {
    systemInstruction: req.system,
    maxOutputTokens: req.maxTokens,
  };
  const tools = toGeminiTools(req.tools);
  if (tools.length > 0) config.tools = tools;
  if (opts.thinkingBudget && opts.thinkingBudget > 0) {
    config.thinkingConfig = { thinkingBudget: opts.thinkingBudget, includeThoughts: true };
  }
  return { model, contents: toGeminiContents(req.messages), config };
}

/** Gemini Developer API (API-key auth). Vertex mode lives in vertex.ts. */
export class GeminiAdapter implements LLMClient {
  readonly id: ProviderId = 'gemini';
  readonly supportsVision = true;
  readonly model: string;
  private apiKey?: string;
  private injected?: GeminiLike;
  private thinkingBudget: number;

  constructor(opts: { apiKey?: string; model?: string; client?: GeminiLike; thinkingBudget?: number } = {}) {
    this.model = opts.model || process.env.GEMINI_MODEL || DEFAULT_MODEL;
    this.apiKey = opts.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    this.injected = opts.client;
    this.thinkingBudget = opts.thinkingBudget ?? Number(process.env.FORGE_THINKING_BUDGET || 0);
  }

  private models(): GeminiLike {
    if (this.injected) return this.injected;
    const ai = new GoogleGenAI({ apiKey: this.apiKey });
    return ai.models as unknown as GeminiLike;
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const body = buildGeminiRequest(this.model, req, { thinkingBudget: this.thinkingBudget });
    return fromGeminiResponse(await this.models().generateContent(body));
  }
}
