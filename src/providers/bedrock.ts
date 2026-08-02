import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import type { ChatRequest, ChatResult, LLMClient, Msg, ProviderId, StopReason, ToolSpec, Usage } from './types.js';
import { clampMaxTokens } from './limits.js';

const DEFAULT_MODEL = 'anthropic.claude-3-5-sonnet-20241022-v2:0';

/** Minimal shape of the Bedrock Runtime client (for testability). */
export interface BedrockLike {
  send(command: unknown): Promise<BedrockResponse>;
}

interface BedrockResponse {
  output?: { message?: { content?: Array<BedrockContentBlock> } };
  stopReason?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadInputTokens?: number;
    cacheWriteInputTokens?: number;
  };
}

type BedrockContentBlock =
  | { text: string }
  | { reasoningContent: { reasoningText?: { text?: string } } }
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

/**
 * Bedrock expresses prompt caching as an explicit `cachePoint` block appended to
 * the stable prefix, rather than Anthropic's per-block `cache_control` field.
 * Only Anthropic-family models on Bedrock support it, so callers gate on
 * {@link supportsBedrockCaching} first.
 */
export function supportsBedrockCaching(model: string): boolean {
  return /anthropic|claude/i.test(model);
}

export function toBedrockToolConfig(
  tools: ToolSpec[],
  opts: { caching?: boolean } = {},
): Record<string, unknown> | undefined {
  if (tools.length === 0) return undefined;
  const specs: Array<Record<string, unknown>> = tools.map((t) => ({
    toolSpec: { name: t.name, description: t.description, inputSchema: { json: t.parameters } },
  }));
  if (opts.caching) specs.push({ cachePoint: { type: 'default' } });
  return { tools: specs };
}

export function toBedrockSystem(system: string, opts: { caching?: boolean } = {}): Array<Record<string, unknown>> {
  const blocks: Array<Record<string, unknown>> = [{ text: system }];
  if (opts.caching && system) blocks.push({ cachePoint: { type: 'default' } });
  return blocks;
}

export function mapBedrockStop(reason: string | undefined): StopReason {
  if (reason === 'tool_use') return 'tool_use';
  if (reason === 'max_tokens') return 'max_tokens';
  return 'end';
}

export function fromBedrockResponse(res: BedrockResponse): ChatResult {
  const blocks = res.output?.message?.content ?? [];
  let text = '';
  let reasoning = '';
  const toolCalls = [];
  for (const block of blocks) {
    if ('text' in block) text += block.text;
    else if ('reasoningContent' in block) reasoning += block.reasoningContent?.reasoningText?.text ?? '';
    else if ('toolUse' in block) {
      toolCalls.push({ id: block.toolUse.toolUseId, name: block.toolUse.name, args: block.toolUse.input ?? {} });
    }
  }
  const usage: Usage = {
    inputTokens: res.usage?.inputTokens ?? 0,
    outputTokens: res.usage?.outputTokens ?? 0,
  };
  if (res.usage?.cacheReadInputTokens) usage.cacheReadTokens = res.usage.cacheReadInputTokens;
  if (res.usage?.cacheWriteInputTokens) usage.cacheWriteTokens = res.usage.cacheWriteInputTokens;
  return {
    text,
    toolCalls,
    usage,
    stopReason: mapBedrockStop(res.stopReason),
    ...(reasoning ? { reasoning } : {}),
  };
}

export class BedrockAdapter implements LLMClient {
  readonly id: ProviderId = 'bedrock';
  readonly supportsVision = true;
  readonly model: string;
  private client: BedrockLike;
  private promptCaching: boolean;

  constructor(opts: { region?: string; model?: string; client?: BedrockLike; promptCaching?: boolean } = {}) {
    this.model = opts.model || process.env.BEDROCK_MODEL_ID || DEFAULT_MODEL;
    const cachingWanted = opts.promptCaching ?? process.env.FORGE_PROMPT_CACHE !== '0';
    this.promptCaching = cachingWanted && supportsBedrockCaching(this.model);
    this.client =
      opts.client ?? (new BedrockRuntimeClient({ region: opts.region || process.env.AWS_REGION }) as unknown as BedrockLike);
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const caching = this.promptCaching;
    const command = new ConverseCommand({
      modelId: this.model,
      system: toBedrockSystem(req.system, { caching }) as never,
      messages: toBedrockMessages(req.messages) as never,
      toolConfig: toBedrockToolConfig(req.tools, { caching }) as never,
      // Converse rejects maxTokens above the model's ceiling with a 400 (not retryable).
      inferenceConfig: { maxTokens: clampMaxTokens(this.model, req.maxTokens) },
    });
    const res = await this.client.send(command);
    return fromBedrockResponse(res);
  }
}
