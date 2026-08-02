import type { ChatRequest, ChatResult, LLMClient, ProviderId } from './types.js';

/**
 * An {@link LLMClient} that tries a primary provider and falls back to others
 * when it fails hard.
 *
 * The agent loop already retries transient failures (429/5xx) via `withRetry`, so
 * by the time a call reaches this wrapper it has genuinely exhausted the primary
 * — a bad key, a decommissioned model, a region outage. Rather than losing the
 * whole run, we move to the next configured provider and keep going.
 *
 * Fallback is per-call, not sticky: a later turn retries the primary first, so a
 * brief outage doesn't pin the whole run to a weaker model.
 */
export class FallbackClient implements LLMClient {
  readonly id: ProviderId;
  readonly supportsVision: boolean;
  readonly model: string;

  /** Providers that have served at least one call, in order of first use. */
  readonly used: ProviderId[] = [];

  constructor(
    private primary: LLMClient,
    private fallbacks: LLMClient[],
    private log: (msg: string) => void = () => {},
  ) {
    this.id = primary.id;
    this.model = primary.model;
    // Only advertise vision if every provider in the chain can handle it —
    // otherwise a mid-run fallback would be handed images it must reject.
    this.supportsVision = [primary, ...fallbacks].every((c) => c.supportsVision);
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const chain = [this.primary, ...this.fallbacks];
    let lastErr: unknown;
    for (const client of chain) {
      try {
        const res = await client.chat(req);
        if (!this.used.includes(client.id)) this.used.push(client.id);
        return res;
      } catch (err) {
        lastErr = err;
        const next = chain[chain.indexOf(client) + 1];
        if (next) {
          this.log(`provider ${client.id} failed (${(err as Error).message}); falling back to ${next.id}`);
        }
      }
    }
    throw lastErr;
  }
}
