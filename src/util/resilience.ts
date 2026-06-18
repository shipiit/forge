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

function defaultRetryable(err: unknown): boolean {
  const status = (err as { status?: number; statusCode?: number })?.status ?? (err as { statusCode?: number })?.statusCode;
  if (typeof status === 'number') return status === 429 || (status >= 500 && status < 600);
  const code = (err as { code?: string })?.code;
  if (code && ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ENOTFOUND'].includes(code)) return true;
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
