/** Small resilience helpers: retry-with-backoff and secret redaction. */

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  /** Decide whether an error is worth retrying (default: 429 / 5xx / network). */
  isRetryable?: (err: unknown) => boolean;
  /** Sleep function; injectable for tests (default real setTimeout). */
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (attempt: number, err: unknown) => void;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * A timeout is not a transient failure.
 *
 * `ECONNRESET` is a blip: something dropped, try again and it works. A request
 * that ran for the entire timeout budget and produced nothing is different —
 * the endpoint took the work and stalled, and asking again buys another full
 * budget of the same. Measured on a real run against a stalling provider: two
 * turns cost 491 and 711 seconds against a 300-second timeout, because each
 * timeout was retried rather than surfaced.
 *
 * So timeouts fail immediately and say so. Everything genuinely transient —
 * rate limits, 5xx, a reset connection, DNS — still retries.
 */
export function isTimeout(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  if (code === 'ETIMEDOUT' || code === 'ETIME') return true;
  const name = (err as { name?: string })?.name ?? '';
  if (/timeout/i.test(name)) return true; // APIConnectionTimeoutError, AbortError variants
  const message = (err as { message?: string })?.message ?? '';
  return /timed?\s*out/i.test(message);
}

function defaultRetryable(err: unknown): boolean {
  if (isTimeout(err)) return false;
  const status = (err as { status?: number; statusCode?: number })?.status ?? (err as { statusCode?: number })?.statusCode;
  if (typeof status === 'number') return status === 429 || (status >= 500 && status < 600);
  const code = (err as { code?: string })?.code;
  if (code && ['ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ENOTFOUND'].includes(code)) return true;
  return false;
}

/**
 * Run `fn`, retrying on transient failures with exponential backoff + jitter.
 * Jitter is derived from the attempt number (no Math.random — keeps runs
 * reproducible and avoids the sandbox's RNG restrictions).
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 3;
  const base = opts.baseDelayMs ?? 500;
  const isRetryable = opts.isRetryable ?? defaultRetryable;
  const sleep = opts.sleep ?? realSleep;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries || !isRetryable(err)) break;
      opts.onRetry?.(attempt + 1, err);
      const jitter = (attempt % 3) * 50;
      await sleep(base * 2 ** attempt + jitter);
    }
  }
  throw lastErr;
}

const SECRET_PATTERNS: RegExp[] = [
  /gh[pousr]_[A-Za-z0-9]{20,}/g, // GitHub tokens
  /sk-[A-Za-z0-9-]{20,}/g, // OpenAI-style keys
  /sk-ant-[A-Za-z0-9-]{20,}/g, // Anthropic keys
  /AKIA[0-9A-Z]{16}/g, // AWS access key id
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /x-access-token:[^@\s]+/g, // token embedded in clone URLs
  /(Bearer\s+)[A-Za-z0-9._-]{20,}/gi,
];

/** Redact common secret shapes from a string before logging. */
export function redactSecrets(input: string): string {
  let out = input;
  for (const pat of SECRET_PATTERNS) out = out.replace(pat, '[REDACTED]');
  return out;
}
