/**
 * Per-model output-token ceilings.
 *
 * The agent loop asks for one budget for every flow (see DEFAULT_MAX_OUTPUT_TOKENS
 * in agent/loop.ts), but each model has its own hard cap and providers reject a
 * request that exceeds it with a non-retryable 400. Adapters clamp here, where the
 * model id is known, so raising the shared budget can never brick a provider.
 */

const CAPS: Array<{ match: RegExp; max: number }> = [
  // Claude 3.5 family: 8192 output tokens.
  { match: /claude-3[.-]5-(sonnet|haiku)/i, max: 8192 },
  // Claude 3 family: 4096.
  { match: /claude-3-(opus|sonnet|haiku)/i, max: 4096 },
];

/** Largest output budget we assume for a model we have no explicit cap for. */
const UNKNOWN_MODEL_MAX = 16384;

/** Clamp a requested output-token budget to what `model` can actually accept. */
export function clampMaxTokens(model: string, requested: number): number {
  const cap = CAPS.find((c) => c.match.test(model))?.max ?? UNKNOWN_MODEL_MAX;
  return Math.min(requested, cap);
}
