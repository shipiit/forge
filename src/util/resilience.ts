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
/**
 * Environment variables whose values are credentials.
 *
 * Pattern matching only catches shapes somebody thought of. A provider key
 * that is a bare 32-character string with no prefix matches nothing — and one
 * reached a public build log, ten characters of it printed inside a JSON parse
 * error, because the value was fed to the wrong provider and the parser quoted
 * what it choked on.
 *
 * These values are known exactly. Redacting them by identity needs no pattern
 * and cannot be defeated by a vendor inventing a new prefix.
 */
const CREDENTIAL_ENV = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'GROQ_API_KEY',
  'TOGETHER_API_KEY',
  'TOGETHERAI_API_KEY',
  'OPENAI_COMPATIBLE_API_KEY',
  'VERTEX_CREDENTIALS_JSON',
  'GITHUB_TOKEN',
  'PRIVATE_KEY',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
];

/** Escape a literal for use inside a RegExp. */
function literal(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function redactSecrets(input: string, env: NodeJS.ProcessEnv = process.env): string {
  let out = input;
  for (const pat of SECRET_PATTERNS) out = out.replace(pat, '[REDACTED]');

  for (const name of CREDENTIAL_ENV) {
    const value = env[name];
    // Short values are not credentials worth redacting, and blanking a common
    // word would make the log unreadable while protecting nothing.
    if (!value || value.length < 12) continue;
    out = out.replace(new RegExp(literal(value), 'g'), '[REDACTED]');
    // A parser that chokes on a credential quotes a prefix of it, not the
    // whole thing — `"yxYLh1SgoD"... is not valid JSON`. The value itself
    // never appears, so matching it whole catches nothing.
    for (const n of [40, 24, 16, 10, 8]) {
      if (value.length > n) out = out.replace(new RegExp(literal(value.slice(0, n)), 'g'), '[REDACTED]');
    }
  }
  return out;
}
