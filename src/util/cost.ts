/** Token-usage cost estimation across providers. Prices are USD per 1M tokens. */

import type { Usage } from '../providers/types.js';

export type { Usage };

export interface CostEstimate {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  usd: number;
  model: string;
  priced: boolean; // false when we had to use the fallback price
  /** What the same run would have cost with no prompt caching. */
  usdWithoutCache: number;
}

/** Approximate public list prices (USD per 1M tokens) for common models. */
interface Price {
  in: number;
  out: number;
  /** Cached-input read rate. Defaults to 10% of input when unset. */
  cacheRead?: number;
  /** Cache-write rate. Defaults to 125% of input when unset. */
  cacheWrite?: number;
}

const PRICES: Array<{ match: RegExp; price: Price }> = [
  { match: /gemini-2\.5-pro/i, price: { in: 1.25, out: 10 } },
  { match: /gemini-2\.5-flash/i, price: { in: 0.3, out: 2.5 } },
  { match: /gemini-2\.0-flash/i, price: { in: 0.1, out: 0.4 } },
  { match: /gemini-1\.5-pro/i, price: { in: 1.25, out: 5 } },
  { match: /gemini-1\.5-flash/i, price: { in: 0.075, out: 0.3 } },
  { match: /gpt-4o-mini/i, price: { in: 0.15, out: 0.6 } },
  { match: /gpt-4o/i, price: { in: 2.5, out: 10 } },
  { match: /gpt-4\.1-nano/i, price: { in: 0.1, out: 0.4 } },
  { match: /gpt-4\.1-mini/i, price: { in: 0.4, out: 1.6 } },
  { match: /gpt-4\.1/i, price: { in: 2, out: 8 } },
  { match: /o3-mini|o1-mini|o4-mini/i, price: { in: 1.1, out: 4.4 } },
  { match: /\bo3\b/i, price: { in: 10, out: 40 } },
  { match: /claude-opus/i, price: { in: 15, out: 75, cacheRead: 1.5, cacheWrite: 18.75 } },
  { match: /claude.*sonnet|claude-3-5-sonnet/i, price: { in: 3, out: 15, cacheRead: 0.3, cacheWrite: 3.75 } },
  { match: /claude.*haiku|claude-3-5-haiku/i, price: { in: 0.8, out: 4, cacheRead: 0.08, cacheWrite: 1 } },
  { match: /llama-3\.3-70b|llama-3\.1-70b/i, price: { in: 0.59, out: 0.79 } },
  { match: /ollama|llama3/i, price: { in: 0, out: 0 } },
];

const FALLBACK: Price = { in: 3, out: 15 };

/** Cached reads are ~10% of the input rate; cache writes ~125%, unless stated. */
function cacheRates(price: Price): { read: number; write: number } {
  return { read: price.cacheRead ?? price.in * 0.1, write: price.cacheWrite ?? price.in * 1.25 };
}

/**
 * Estimate the USD cost of a run given total token usage and the model id.
 * Cached input tokens are billed at their own (much lower) rate, so a run with
 * prompt caching on reports both the real cost and the un-cached equivalent.
 */
export function estimateCost(usage: Usage, model: string): CostEstimate {
  const entry = PRICES.find((p) => p.match.test(model));
  const price = entry?.price ?? FALLBACK;
  const { read, write } = cacheRates(price);

  const cacheReadTokens = usage.cacheReadTokens ?? 0;
  const cacheWriteTokens = usage.cacheWriteTokens ?? 0;
  const perM = (tokens: number, rate: number) => (tokens / 1_000_000) * rate;

  const usd =
    perM(usage.inputTokens, price.in) +
    perM(usage.outputTokens, price.out) +
    perM(cacheReadTokens, read) +
    perM(cacheWriteTokens, write);

  // Without caching those same tokens would all have been fresh input.
  const usdWithoutCache =
    perM(usage.inputTokens + cacheReadTokens + cacheWriteTokens, price.in) + perM(usage.outputTokens, price.out);

  const round = (n: number) => Math.round(n * 10_000) / 10_000;
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    // round to 4 decimals to avoid floating-point noise in display
    usd: round(usd),
    usdWithoutCache: round(usdWithoutCache),
    model,
    priced: Boolean(entry),
  };
}

/**
 * Group digits in a fixed locale. These strings end up in GitHub comments, so
 * they must not vary with the host's locale (an en-IN server would otherwise
 * render 900,000 as 9,00,000).
 */
function n(value: number): string {
  return value.toLocaleString('en-US');
}

/** Human-readable one-liner for logs / PR bodies. */
export function formatCost(c: CostEstimate): string {
  const approx = c.priced ? '' : ' (approx — model price unknown)';
  const cached =
    c.cacheReadTokens > 0
      ? ` · ${n(c.cacheReadTokens)} cached (saved ~$${Math.max(0, c.usdWithoutCache - c.usd).toFixed(4)})`
      : '';
  return `${n(c.inputTokens)} in + ${n(c.outputTokens)} out tokens${cached} · ~$${c.usd.toFixed(4)}${approx}`;
}

/** Sum several usage records (a fix run is several agent conversations). */
export function addUsage(a: Usage, b: Usage): Usage {
  const out: Usage = {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  };
  const read = (a.cacheReadTokens ?? 0) + (b.cacheReadTokens ?? 0);
  const write = (a.cacheWriteTokens ?? 0) + (b.cacheWriteTokens ?? 0);
  if (read) out.cacheReadTokens = read;
  if (write) out.cacheWriteTokens = write;
  return out;
}
