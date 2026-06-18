import { VertexAI } from '@google-cloud/vertexai';
import type { ChatRequest, ChatResult, LLMClient, Msg, ProviderId, StopReason, ToolSpec } from './types.js';

const DEFAULT_MODEL = 'gemini-2.5-pro';

/** Minimal shape of the Gemini generateContent call we depend on (for testability). */
export interface GeminiLike {
  generateContent(req: Record<string, unknown>): Promise<GeminiResponse>;
}

interface GeminiResponse {
  response: {
    candidates?: Array<{
      content: { parts: Array<GeminiPart> };
      finishReason?: string;
    }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
}

type GeminiPart =
  | { text: string }
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
  const cand = res.response.candidates?.[0];
  const parts = cand?.content?.parts ?? [];
  let text = '';
  const toolCalls = [];
  let i = 0;
  for (const part of parts) {
    if ('text' in part) text += part.text;
    else if ('functionCall' in part) {
      toolCalls.push({ id: `${part.functionCall.name}-${i++}`, name: part.functionCall.name, args: part.functionCall.args ?? {} });
    }
  }
  const usage = res.response.usageMetadata ?? {};
  return {
    text,
    toolCalls,
    usage: { inputTokens: usage.promptTokenCount ?? 0, outputTokens: usage.candidatesTokenCount ?? 0 },
    stopReason: mapGeminiStop(cand?.finishReason, toolCalls.length > 0),
  };
}

export class VertexAdapter implements LLMClient {
  readonly id: ProviderId = 'vertex';
  readonly supportsVision = true;
  private model: string;
  private project?: string;
  private location: string;
  private injected?: GeminiLike;

  constructor(opts: { project?: string; location?: string; model?: string; client?: GeminiLike } = {}) {
    this.model = opts.model || process.env.VERTEX_MODEL || DEFAULT_MODEL;
    this.project = opts.project || process.env.VERTEX_PROJECT;
    this.location = opts.location || process.env.VERTEX_LOCATION || 'us-central1';
    this.injected = opts.client;
  }

  private getModel(system: string): GeminiLike {
    if (this.injected) return this.injected;
    const vertex = new VertexAI({ project: this.project, location: this.location });
    return vertex.getGenerativeModel({
      model: this.model,
      systemInstruction: system,
    }) as unknown as GeminiLike;
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const model = this.getModel(req.system);
    const body: Record<string, unknown> = {
      contents: toGeminiContents(req.messages),
      generationConfig: { maxOutputTokens: req.maxTokens },
    };
    const tools = toGeminiTools(req.tools);
    if (tools.length > 0) body.tools = tools;
    const res = await model.generateContent(body);
    return fromGeminiResponse(res);
  }
}
