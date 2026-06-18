import type { LLMClient, ProviderId } from './types.js';
import { FakeLLMClient } from './fake.js';

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
 * Build an {@link LLMClient} from configuration. Real provider adapters
 * (Anthropic, OpenAI, Vertex Gemini, Bedrock) are wired in subsequent slices;
 * for now the factory supports the credential-free `fake` provider used by the
 * test suite and the local demo.
 */
export function createLLMClient(config: ProviderConfig, opts: { demoTask?: string } = {}): LLMClient {
  switch (config.provider) {
    case 'fake':
      return new FakeLLMClient(opts.demoTask ? demoScript(opts.demoTask) : []);
    case 'anthropic':
    case 'openai':
    case 'vertex':
    case 'bedrock':
      throw new Error(
        `Provider "${config.provider}" adapter is not wired yet (coming in the provider-adapter slice). ` +
          'Use --provider fake for a credential-free local run.',
      );
    default:
      throw new Error(`Unknown provider: ${config.provider as string}`);
  }
}
