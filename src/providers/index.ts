import type { LLMClient, ProviderId } from './types.js';
import { FakeLLMClient } from './fake.js';
import { AnthropicAdapter } from './anthropic.js';
import { OpenAIAdapter } from './openai.js';
import { VertexAdapter } from './vertex.js';
import { BedrockAdapter } from './bedrock.js';

export interface ProviderConfig {
  provider: ProviderId;
  /** Model id (provider-specific). Optional; adapters fall back to a default. */
  model?: string;
}

/** A built-in demo script so `--provider fake` runs end-to-end with no credentials. */
function demoScript(task: string) {
  const fileMatch = task.match(/\b([\w./-]+\.\w+)\b/);
  const file = fileMatch?.[1] ?? 'FORGE_NOTES.md';
  return [
    {
      text: `I'll create ${file} to satisfy the task.`,
      toolCalls: [
        {
          id: 'demo1',
          name: 'write_file',
          args: { path: file, content: `# Created by ShipIT Forge (demo)\n\nTask: ${task}\n` },
        },
      ],
      usage: { inputTokens: 0, outputTokens: 0 },
      stopReason: 'tool_use' as const,
    },
    {
      text: `Done. Created ${file} for the task: "${task}".`,
      toolCalls: [],
      usage: { inputTokens: 0, outputTokens: 0 },
      stopReason: 'end' as const,
    },
  ];
}

/**
 * Build an {@link LLMClient} from configuration. The provider is chosen by
 * `config.provider`; credentials are read from the standard environment
 * variables for that provider (see README). The `fake` provider needs no
 * credentials and is used by tests and the local demo.
 */
export function createLLMClient(config: ProviderConfig, opts: { demoTask?: string } = {}): LLMClient {
  switch (config.provider) {
    case 'fake':
      return new FakeLLMClient(opts.demoTask ? demoScript(opts.demoTask) : []);
    case 'anthropic':
      return new AnthropicAdapter({ apiKey: process.env.ANTHROPIC_API_KEY, model: config.model });
    case 'openai':
      return new OpenAIAdapter({ apiKey: process.env.OPENAI_API_KEY, model: config.model });
    case 'vertex':
      return new VertexAdapter({ model: config.model });
    case 'bedrock':
      return new BedrockAdapter({ model: config.model });
    default:
      throw new Error(`Unknown provider: ${config.provider as string}`);
  }
}

export { FakeLLMClient } from './fake.js';
