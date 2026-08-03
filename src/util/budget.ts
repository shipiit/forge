import type { Usage } from '../providers/types.js';
import { estimateCost } from './cost.js';

/**
 * Per-run spend ceiling.
 *
 * `maxIterations` bounds how many *turns* a run takes, which is not the same as
 * bounding what it costs: twenty-five turns over a large repository on an
 * expensive model is a very different bill from twenty-five turns on a small
 * one. This caps the money directly.
 *
 * Deliberately stateless — it only ever looks at the usage accumulated by the
 * run in front of it. That means it works identically in the hosted App, in a
 * GitHub Action container that is destroyed afterwards, and in the CLI, with no
 * database and nothing to keep in sync.
 */

/** No cap. Chosen over 0 so an unset env var can't silently mean "spend nothing". */
export const NO_CAP = Infinity;

/**
 * Read a USD cap from an env var. An unset, empty, or unparseable value means no
 * cap — a malformed budget must not stop the agent from working, it should just
 * fail to constrain it.
 */
export function parseCap(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return NO_CAP;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return NO_CAP;
  return n;
}

export interface BudgetState {
  /** USD spent by this run so far. */
  spentUsd: number;
  /** The ceiling, or Infinity. */
  capUsd: number;
  /** True once the run has spent its allowance. */
  exceeded: boolean;
  /** Fraction of the cap used, 0–1+. Infinity-safe. */
  fraction: number;
}

/** Where this run stands against its ceiling. */
export function budgetState(usage: Usage, model: string, capUsd: number): BudgetState {
  const spentUsd = estimateCost(usage, model).usd;
  return {
    spentUsd,
    capUsd,
    exceeded: spentUsd >= capUsd,
    fraction: capUsd === NO_CAP ? 0 : spentUsd / capUsd,
  };
}

/**
 * Would one more turn plausibly blow the cap?
 *
 * Checking only after the fact means the run always overshoots by a turn, and a
 * turn can be expensive. This projects the next turn using the most recent one
 * as the estimate, so the run stops *before* the overspend rather than after it.
 */
export function wouldExceed(state: BudgetState, lastTurnUsd: number): boolean {
  if (state.capUsd === NO_CAP) return false;
  return state.spentUsd + lastTurnUsd > state.capUsd;
}

/** A short, honest line for the comment Forge posts when it stops early. */
export function renderBudgetStop(state: BudgetState, model: string): string {
  return (
    `⚠️ **Stopped at the spend cap.** This run reached $${state.spentUsd.toFixed(4)} of its ` +
    `$${state.capUsd.toFixed(2)} ceiling on \`${model}\` and stopped before going further, so the ` +
    `work below is incomplete.\n\n` +
    `Raise the cap with \`spend_cap_per_run_usd\` in \`.github/agent.yml\` (or ` +
    `\`FORGE_SPEND_CAP_RUN\`), narrow the task, or use a cheaper model.`
  );
}
