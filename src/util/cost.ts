/** Token-usage cost estimation across providers. Prices are USD per 1M tokens. */

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export interface CostEstimate {
  inputTokens: number;
  outputTokens: number;
  usd: number;
  model: string;
  priced: boolean; // false when we had to use the fallback price
}

/** Approximate public list prices (USD per 1M tokens) for common models. */
interface Price { in: number; out: number }
const PRICES: Array<{ match: RegExp; price: Price }> = [
  { match: /gemini-2\.5-pro/i, price: { in: 1.25, out: 10 } },
  { match: /gemini-2\.5-flash/i, price: { in: 0.3, out: 2.5 } },
  { match: /gemini-2\.0-flash/i, price: { in: 0.1, out: 0.4 } },
  { match: /gemini-1\.5-pro/i, price: { in: 1.25, out: 5 } },
  { match: /gemini-1\.5-flash/i, price: { in: 0.075, out: 0.3 } },
  { match: /gpt-4o-mini/i, price: { in: 0.15, out: 0.6 } },
  { match: /gpt-4o/i, price: { in: 2.5, out: 10 } },
  { match: /o3-mini|o1-mini/i, price: { in: 1.1, out: 4.4 } },
  { match: /claude-opus/i, price: { in: 15, out: 75 } },
  { match: /claude.*sonnet|claude-3-5-sonnet/i, price: { in: 3, out: 15 } },
  { match: /claude.*haiku|claude-3-5-haiku/i, price: { in: 0.8, out: 4 } },
];

const FALLBACK: Price = { in: 3, out: 15 };

/** Estimate the USD cost of a run given total token usage and the model id. */
export function estimateCost(usage: Usage, model: string): CostEstimate {
  const entry = PRICES.find((p) => p.match.test(model));
  const price = entry?.price ?? FALLBACK;
  const usd = (usage.inputTokens / 1_000_000) * price.in + (usage.outputTokens / 1_000_000) * price.out;
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    // round to 4 decimals to avoid floating-point noise in display
    usd: Math.round(usd * 10_000) / 10_000,
    model,
    priced: Boolean(entry),
  };
}

/** Human-readable one-liner for logs / PR bodies. */
export function formatCost(c: CostEstimate): string {
  const approx = c.priced ? '' : ' (approx — model price unknown)';
  return `${c.inputTokens.toLocaleString()} in + ${c.outputTokens.toLocaleString()} out tokens · ~$${c.usd.toFixed(4)}${approx}`;
}
