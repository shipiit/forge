/**
 * Per-repository run limiting.
 *
 * The threat is not a malicious actor so much as an ordinary accident: a bot
 * that comments in a loop, a webhook redelivery storm, a workflow that triggers
 * itself. Iterations are already bounded and CI auto-fix stops after two
 * attempts, but nothing bounded how many *runs* could start.
 *
 * ## Why the store is an interface
 *
 * A sliding window needs to remember when recent runs happened, and where that
 * memory lives differs per surface:
 *
 * - **Hosted App** — one long-lived process, so an in-memory window is accurate
 *   until a restart. Good enough: a restart is rare and fails open, which is the
 *   safe direction for a limiter that must never wedge the agent.
 * - **GitHub Action** — a fresh container per event, so in-memory always reads
 *   zero and the limiter is a no-op. GitHub's own `concurrency:` group is the
 *   real control there, which is why the generated workflow sets one.
 * - **Later** — the usage database gives a durable window shared across
 *   instances. That plugs in here without touching a caller.
 *
 * Being explicit about this beats a limiter that quietly does nothing on the
 * surface most people use.
 */

export interface RateLimitStore {
  /** Timestamps (epoch ms) of runs for `key` at or after `since`. */
  recent(key: string, since: number): Promise<number[]>;
  /** Record that a run started for `key` at `at`. */
  add(key: string, at: number): Promise<void>;
}

/** In-memory sliding window. Accurate within one process; resets on restart. */
export class MemoryRateLimitStore implements RateLimitStore {
  private windows = new Map<string, number[]>();

  async recent(key: string, since: number): Promise<number[]> {
    const all = this.windows.get(key) ?? [];
    // Prune as we read; nothing else ever cleans this up.
    const live = all.filter((t) => t >= since);
    if (live.length !== all.length) this.windows.set(key, live);
    return live;
  }

  async add(key: string, at: number): Promise<void> {
    const all = this.windows.get(key) ?? [];
    all.push(at);
    this.windows.set(key, all);
  }
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Runs already started inside the window. */
  used: number;
  limit: number;
  /** Epoch ms when capacity frees up. Only meaningful when denied. */
  retryAt?: number;
}

export const HOUR_MS = 60 * 60 * 1000;

/**
 * Check and consume one unit of capacity.
 *
 * Fails **open**: if the store throws, the run proceeds. A limiter that blocks
 * the agent because its bookkeeping broke is worse than no limiter — the point
 * is to stop runaway loops, not to become one more thing that can take the
 * agent down.
 */
export async function checkRateLimit(
  store: RateLimitStore,
  key: string,
  limitPerHour: number,
  now: number,
  windowMs = HOUR_MS,
): Promise<RateLimitDecision> {
  if (!Number.isFinite(limitPerHour) || limitPerHour <= 0) {
    return { allowed: true, used: 0, limit: limitPerHour };
  }

  try {
    const since = now - windowMs;
    const recent = await store.recent(key, since);

    if (recent.length >= limitPerHour) {
      // Capacity frees when the oldest run in the window ages out.
      const oldest = Math.min(...recent);
      return { allowed: false, used: recent.length, limit: limitPerHour, retryAt: oldest + windowMs };
    }

    await store.add(key, now);
    return { allowed: true, used: recent.length + 1, limit: limitPerHour };
  } catch {
    return { allowed: true, used: 0, limit: limitPerHour };
  }
}

/** The key a limit applies to. Per repository, not per organization. */
export function repoKey(owner: string, repo: string): string {
  return `${owner}/${repo}`.toLowerCase();
}

/** A short, honest line for the comment Forge posts when it declines to run. */
export function renderRateLimited(d: RateLimitDecision, now: number): string {
  const minutes = d.retryAt ? Math.max(1, Math.ceil((d.retryAt - now) / 60_000)) : 60;
  return (
    `⏳ **Rate limit reached.** This repository has started ${d.used} runs in the last hour, ` +
    `which is its limit of ${d.limit}. Capacity frees up in about ${minutes} minute${minutes === 1 ? '' : 's'}.\n\n` +
    `Raise it with \`max_runs_per_hour\` in \`.github/agent.yml\` (or \`FORGE_MAX_RUNS_PER_HOUR\`).`
  );
}
