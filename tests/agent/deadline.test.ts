import { describe, it, expect } from 'vitest';
import { runAgent } from '../../src/agent/loop.js';
import { isTimeout } from '../../src/util/resilience.js';
import type { ChatRequest, ChatResult, LLMClient } from '../../src/providers/types.js';

/**
 * Bounding a run in the dimension it actually ran away in.
 *
 * Turn count and spend both bound a run in the dimensions a healthy provider
 * varies in. Neither bounds time. Measured on a real review: twelve turns,
 * inside the iteration limit, costing pennies — and twenty-three minutes,
 * because two of those turns took 491 and 711 seconds against a provider that
 * stalls intermittently.
 */

/** A client whose every turn takes a fixed, controllable amount of time. */
function slowClient(msPerTurn: number, clock: { now: number }): LLMClient {
  return {
    id: 'fake',
    model: 'fake',
    supportsVision: false,
    async chat(_req: ChatRequest): Promise<ChatResult> {
      clock.now += msPerTurn;
      return {
        text: '',
        toolCalls: [{ id: 't1', name: 'noop', args: {} }],
        usage: { inputTokens: 1, outputTokens: 1 },
        stopReason: 'tool_use',
      };
    },
  } as unknown as LLMClient;
}

const noop = {
  spec: { name: 'noop', description: 'does nothing', parameters: { type: 'object', properties: {} } },
  async run() {
    return [{ type: 'text' as const, text: 'ok' }];
  },
};

describe('a run that will not end', () => {
  it('stops at the deadline and reports what it has', async () => {
    const clock = { now: 1_000_000 };
    const realNow = Date.now;
    Date.now = () => clock.now;
    try {
      const result = await runAgent({
        client: slowClient(60_000, clock), // a minute a turn
        system: 's',
        initialContent: [{ type: 'text', text: 'go' }],
        tools: [noop],
        // Forty turns are allowed and would all be affordable. Time is the
        // only limit that stops this.
        limits: { maxIterations: 40, maxOutputTokens: 100, maxWallClockMs: 300_000 },
        cwd: '/tmp',
      });
      expect(result.stoppedBy).toBe('deadline');
      expect(result.iterations).toBeLessThan(40);
    } finally {
      Date.now = realNow;
    }
  });

  it('does not interfere with a run that finishes in time', async () => {
    const clock = { now: 1_000_000 };
    const realNow = Date.now;
    Date.now = () => clock.now;
    try {
      const client = {
        id: 'fake',
        model: 'fake',
        supportsVision: false,
        async chat(): Promise<ChatResult> {
          clock.now += 1_000;
          return { text: 'done', toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 }, stopReason: 'end' };
        },
      } as unknown as LLMClient;
      const result = await runAgent({
        client,
        system: 's',
        initialContent: [{ type: 'text', text: 'go' }],
        tools: [noop],
        limits: { maxIterations: 40, maxOutputTokens: 100, maxWallClockMs: 300_000 },
        cwd: '/tmp',
      });
      expect(result.stoppedBy).toBe('end');
      expect(result.finalText).toBe('done');
    } finally {
      Date.now = realNow;
    }
  });
});

describe('what is worth trying again', () => {
  it('does not treat a timeout as transient', () => {
    // Retrying a stall buys another full timeout of the same stall. Two turns
    // at 491s and 711s against a 300s budget is what that looks like.
    expect(isTimeout({ code: 'ETIMEDOUT' })).toBe(true);
    expect(isTimeout({ name: 'APIConnectionTimeoutError' })).toBe(true);
    expect(isTimeout(new Error('Request timed out.'))).toBe(true);
  });

  it('still recognises a genuine blip as a blip', () => {
    expect(isTimeout({ code: 'ECONNRESET' })).toBe(false);
    expect(isTimeout({ status: 429 })).toBe(false);
    expect(isTimeout({ status: 503 })).toBe(false);
  });
});
