import { parseFilters, type TriggerFilter } from './github/filters.js';
import { parseRoutines, type Routine } from './routines.js';
import { parseCap } from './util/budget.js';
import type { FindingIssueMode } from './github/findingIssues.js';
import type { ReviewFinding } from './github/review.js';

/** Per-repository configuration, read from `.github/agent.yml` (all optional). */
export interface ForgeConfig {
  /** Provider-specific model id override. */
  model?: string;
  /** Label that triggers a fix. */
  triggerLabel: string;
  /** Mention handle that addresses the agent, e.g. "@shipit-forge". */
  triggerPhrase: string;
  /** When to attempt a fix: on the trigger label, on every opened issue, or never. */
  autoFix: 'label' | 'opened' | 'off';
  /** When to review PRs: every PR, only when invited/commanded, or never. */
  autoReview: 'always' | 'requested' | 'off';
  /** Review cadence, mirroring Claude Code's per-repo Review Behavior. */
  reviewBehavior: 'opened' | 'every_push' | 'manual';
  /** Explicit test command override (else auto-detected). */
  testCommand?: string;
  /** Review thoroughness. */
  reviewDepth: 'light' | 'standard' | 'deep';
  /** Globs to ignore when reviewing/searching. */
  ignorePaths: string[];
  /** Optional path (in the repo) to a SARIF file to ingest during review. */
  sarifPath?: string;
  /** Max low-severity inline comments per review; -1 disables the cap. */
  maxNits: number;
  /** Per-run agent iteration cap (Claude Code's --max-turns). */
  maxIterations: number;
  /** Conditions an event must satisfy before a run starts. */
  filters: TriggerFilter[];
  /** Maintain a change-history document from merged work. */
  historyEnabled: boolean;
  /** Path of the change-history document (single mode) or its directory (per_commit). */
  historyPath: string;
  /**
   * `single` keeps one running document; `per_commit` writes a new file per
   * change, named after it, into `historyPath` treated as a directory.
   */
  historyMode: 'single' | 'per_commit';
  /** Saved agent configurations plus their triggers. */
  routines: Routine[];
  /** USD ceiling for a single run. Infinity means no cap. */
  spendCapPerRunUsd: number;
  /** Runs allowed per repository per hour. 0 or less means no limit. */
  maxRunsPerHour: number;
  /** Print the token/spend footer under the agent's comments. */
  showCost: boolean;
  /** Scan for committed credentials on every pull request. */
  secretScan: boolean;
  /** Turn findings into issues: off, one rollup issue, or one issue each. */
  findingsToIssues: FindingIssueMode;
  /** Findings below this severity never become issues. */
  findingsMinSeverity: ReviewFinding['severity'];
  /** Ceiling on issues opened by a single run. */
  findingsMaxIssues: number;
}

const REVIEW_BEHAVIORS = ['opened', 'every_push', 'manual'] as const;

/** Defaults, seeded from environment variables (so ops can set org-wide defaults). */
export function defaultConfig(env: NodeJS.ProcessEnv = process.env): ForgeConfig {
  return {
    model: env.FORGE_MODEL || undefined,
    triggerLabel: env.FORGE_TRIGGER_LABEL || 'agent-fix',
    triggerPhrase: (env.FORGE_DISPLAY_HANDLE || '@shipit-forge').toLowerCase(),
    autoFix: (env.FORGE_AUTO_FIX as ForgeConfig['autoFix']) || 'label',
    autoReview: (env.FORGE_AUTO_REVIEW as ForgeConfig['autoReview']) || 'always',
    reviewBehavior: (env.FORGE_REVIEW_BEHAVIOR as ForgeConfig['reviewBehavior']) || 'every_push',
    testCommand: env.FORGE_TEST_COMMAND || undefined,
    reviewDepth: (env.FORGE_REVIEW_DEPTH as ForgeConfig['reviewDepth']) || 'standard',
    ignorePaths: [],
    sarifPath: env.FORGE_SARIF_PATH || undefined,
    maxNits: Number(env.FORGE_MAX_NITS ?? 5),
    maxIterations: Number(env.MAX_ITERATIONS || 25),
    filters: [],
    historyEnabled: env.FORGE_HISTORY === '1',
    historyPath: env.FORGE_HISTORY_PATH || 'docs/CHANGE-HISTORY.md',
    historyMode: (env.FORGE_HISTORY_MODE as ForgeConfig['historyMode']) || 'single',
    routines: [],
    spendCapPerRunUsd: parseCap(env.FORGE_SPEND_CAP_RUN),
    maxRunsPerHour: Number(env.FORGE_MAX_RUNS_PER_HOUR ?? 0),
    showCost: env.FORGE_SHOW_COST !== '0' && env.FORGE_SHOW_COST !== 'false',
    // On by default: a committed credential is the one finding whose cost of
    // being missed is unbounded, and the scan is free.
    secretScan: env.FORGE_SECRET_SCAN !== '0' && env.FORGE_SECRET_SCAN !== 'false',
    findingsToIssues: (env.FORGE_FINDINGS_TO_ISSUES as FindingIssueMode) || 'off',
    findingsMinSeverity: (env.FORGE_FINDINGS_MIN_SEVERITY as ReviewFinding['severity']) || 'high',
    findingsMaxIssues: Number(env.FORGE_FINDINGS_MAX_ISSUES ?? 10),
  };
}

/**
 * Merge a raw (untrusted) config object from `.github/agent.yml` over the
 * defaults, validating enum fields and ignoring anything unrecognized so a
 * malformed repo config can never crash the app.
 */
export function mergeConfig(raw: unknown, base: ForgeConfig = defaultConfig()): ForgeConfig {
  const r = (raw ?? {}) as Record<string, unknown>;
  const enumOr = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
    typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
  const intOr = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : fallback;

  return {
    model: typeof r.model === 'string' ? r.model : base.model,
    triggerLabel: typeof r.trigger_label === 'string' ? r.trigger_label : base.triggerLabel,
    triggerPhrase:
      typeof r.trigger_phrase === 'string' && r.trigger_phrase.trim()
        ? r.trigger_phrase.trim().toLowerCase()
        : base.triggerPhrase,
    autoFix: enumOr(r.auto_fix, ['label', 'opened', 'off'] as const, base.autoFix),
    autoReview: enumOr(r.auto_review, ['always', 'requested', 'off'] as const, base.autoReview),
    reviewBehavior: enumOr(r.review_behavior, REVIEW_BEHAVIORS, base.reviewBehavior),
    testCommand: typeof r.test_command === 'string' ? r.test_command : base.testCommand,
    reviewDepth: enumOr(r.review_depth, ['light', 'standard', 'deep'] as const, base.reviewDepth),
    ignorePaths: Array.isArray(r.ignore_paths)
      ? r.ignore_paths.filter((p): p is string => typeof p === 'string')
      : base.ignorePaths,
    sarifPath: typeof r.sarif_path === 'string' ? r.sarif_path : base.sarifPath,
    maxNits: intOr(r.max_nits, base.maxNits),
    maxIterations: Math.max(1, intOr(r.max_iterations, base.maxIterations)),
    filters: r.filters !== undefined ? parseFilters(r.filters) : base.filters,
    historyEnabled: typeof r.history === 'boolean' ? r.history : base.historyEnabled,
    historyPath: typeof r.history_path === 'string' ? r.history_path : base.historyPath,
    historyMode: enumOr(r.history_mode, ['single', 'per_commit'] as const, base.historyMode),
    routines: r.routines !== undefined ? parseRoutines(r.routines) : base.routines,
    spendCapPerRunUsd:
      typeof r.spend_cap_per_run_usd === 'number' && r.spend_cap_per_run_usd > 0
        ? r.spend_cap_per_run_usd
        : base.spendCapPerRunUsd,
    maxRunsPerHour: intOr(r.max_runs_per_hour, base.maxRunsPerHour),
    showCost: typeof r.show_cost === 'boolean' ? r.show_cost : base.showCost,
    secretScan: typeof r.secret_scan === 'boolean' ? r.secret_scan : base.secretScan,
    findingsToIssues: enumOr(r.findings_to_issues, ['off', 'rollup', 'per_finding'] as const, base.findingsToIssues),
    findingsMinSeverity: enumOr(
      r.findings_min_severity,
      ['critical', 'high', 'medium', 'low', 'info'] as const,
      base.findingsMinSeverity,
    ),
    findingsMaxIssues: Math.max(1, intOr(r.findings_max_issues, base.findingsMaxIssues)),
  };
}
