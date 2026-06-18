import type { ChatRequest, ChatResult, LLMClient, ProviderId } from './types.js';

/**
 * A scripted LLM client for tests and credential-free local demos.
 *
 * Construct it with the exact sequence of {@link ChatResult}s you want it to
 * return. Each call to {@link chat} returns the next one and records the request
 * it received (for assertions). When the script runs out it throws.
 */
export class FakeLLMClient implements LLMClient {
  readonly id: ProviderId = 'fake';
  readonly supportsVision: boolean;

  /** Requests received, in order — handy for test assertions. */
  readonly requests: ChatRequest[] = [];

  private queue: ChatResult[];

  constructor(script: ChatResult[], opts: { supportsVision?: boolean } = {}) {
    this.queue = [...script];
    this.supportsVision = opts.supportsVision ?? true;
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    // Snapshot the messages array: the agent loop reuses one live array and
    // pushes to it across turns, so we must capture its state at call time.
    this.requests.push({ ...req, messages: [...req.messages] });
    const next = this.queue.shift();
    if (!next) {
      throw new Error('FakeLLMClient script exhausted: chat() called more times than scripted.');
    }
    return next;
  }
}
