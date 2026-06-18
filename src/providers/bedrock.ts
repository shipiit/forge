import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import type { ChatRequest, ChatResult, LLMClient, Msg, ProviderId, StopReason, ToolSpec } from './types.js';

const DEFAULT_MODEL = 'anthropic.claude-3-5-sonnet-20241022-v2:0';

/** Minimal shape of the Bedrock Runtime client (for testability). */
export interface BedrockLike {
  send(command: unknown): Promise<BedrockResponse>;
}

interface BedrockResponse {
  output?: { message?: { content?: Array<BedrockContentBlock> } };
  stopReason?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

type BedrockContentBlock =
  | { text: string }
  | { toolUse: { toolUseId: string; name: string; input: Record<string, unknown> } };

const FORMAT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

/** Convert normalized messages to the Bedrock Converse `messages` array. */
export function toBedrockMessages(messages: Msg[]): Array<Record<string, unknown>> {
  return messages.map((m) => ({
    role: m.role,
    content: m.content.map((part) => {
      switch (part.type) {
        case 'text':
          return { text: part.text };
        case 'image':
          return {
            image: {
              format: FORMAT_BY_MIME[part.mime] ?? 'png',
              source: { bytes: Buffer.from(part.dataB64, 'base64') },
            },
          };
        case 'tool_use':
          return { toolUse: { toolUseId: part.id, name: part.name, input: part.args } };
        case 'tool_result':
          return {
            toolResult: {
              toolUseId: part.toolCallId,
              content: [{ text: part.content }],
              status: part.isError ? 'error' : 'success',
            },
          };
      }
    }),
  }));
}

export function toBedrockToolConfig(tools: ToolSpec[]): Record<string, unknown> | undefined {
  if (tools.length === 0) return undefined;
  return {
    tools: tools.map((t) => ({
      toolSpec: { name: t.name, description: t.description, inputSchema: { json: t.parameters } },
    })),
  };
}

export function mapBedrockStop(reason: string | undefined): StopReason {
  if (reason === 'tool_use') return 'tool_use';
  if (reason === 'max_tokens') return 'max_tokens';
  return 'end';
}

export function fromBedrockResponse(res: BedrockResponse): ChatResult {
  const blocks = res.output?.message?.content ?? [];
  let text = '';
  const toolCalls = [];
  for (const block of blocks) {
    if ('text' in block) text += block.text;
    else if ('toolUse' in block) {
      toolCalls.push({ id: block.toolUse.toolUseId, name: block.toolUse.name, args: block.toolUse.input ?? {} });
    }
  }
  return {
    text,
    toolCalls,
    usage: { inputTokens: res.usage?.inputTokens ?? 0, outputTokens: res.usage?.outputTokens ?? 0 },
    stopReason: mapBedrockStop(res.stopReason),
  };
}

export class BedrockAdapter implements LLMClient {
  readonly id: ProviderId = 'bedrock';
  readonly supportsVision = true;
  private client: BedrockLike;
  private model: string;

  constructor(opts: { region?: string; model?: string; client?: BedrockLike } = {}) {
    this.model = opts.model || process.env.BEDROCK_MODEL_ID || DEFAULT_MODEL;
    this.client =
      opts.client ?? (new BedrockRuntimeClient({ region: opts.region || process.env.AWS_REGION }) as unknown as BedrockLike);
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const command = new ConverseCommand({
      modelId: this.model,
      system: [{ text: req.system }],
      messages: toBedrockMessages(req.messages) as never,
      toolConfig: toBedrockToolConfig(req.tools) as never,
      inferenceConfig: { maxTokens: req.maxTokens },
    });
    const res = await this.client.send(command);
    return fromBedrockResponse(res);
  }
}
