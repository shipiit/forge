/** Per-repository configuration, read from `.github/agent.yml` (all optional). */
export interface ForgeConfig {
  /** Provider-specific model id override. */
  model?: string;
  /** Label that triggers a fix. */
  triggerLabel: string;
  /** When to attempt a fix: on the trigger label, on every opened issue, or never. */
  autoFix: 'label' | 'opened' | 'off';
  /** When to review PRs: every PR, only when invited/commanded, or never. */
  autoReview: 'always' | 'requested' | 'off';
  /** Explicit test command override (else auto-detected). */
  testCommand?: string;
  /** Review thoroughness. */
  reviewDepth: 'light' | 'standard' | 'deep';
  /** Globs to ignore when reviewing/searching. */
  ignorePaths: string[];
  /** Optional path (in the repo) to a SARIF file to ingest during review. */
  sarifPath?: string;
}

/** Defaults, seeded from environment variables (so ops can set org-wide defaults). */
export function defaultConfig(env: NodeJS.ProcessEnv = process.env): ForgeConfig {
  return {
    model: env.FORGE_MODEL || undefined,
    triggerLabel: env.FORGE_TRIGGER_LABEL || 'agent-fix',
    autoFix: (env.FORGE_AUTO_FIX as ForgeConfig['autoFix']) || 'label',
    autoReview: (env.FORGE_AUTO_REVIEW as ForgeConfig['autoReview']) || 'always',
    testCommand: env.FORGE_TEST_COMMAND || undefined,
    reviewDepth: (env.FORGE_REVIEW_DEPTH as ForgeConfig['reviewDepth']) || 'standard',
    ignorePaths: [],
    sarifPath: env.FORGE_SARIF_PATH || undefined,
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

  return {
    model: typeof r.model === 'string' ? r.model : base.model,
    triggerLabel: typeof r.trigger_label === 'string' ? r.trigger_label : base.triggerLabel,
    autoFix: enumOr(r.auto_fix, ['label', 'opened', 'off'] as const, base.autoFix),
    autoReview: enumOr(r.auto_review, ['always', 'requested', 'off'] as const, base.autoReview),
    testCommand: typeof r.test_command === 'string' ? r.test_command : base.testCommand,
    reviewDepth: enumOr(r.review_depth, ['light', 'standard', 'deep'] as const, base.reviewDepth),
    ignorePaths: Array.isArray(r.ignore_paths) ? r.ignore_paths.filter((p): p is string => typeof p === 'string') : base.ignorePaths,
    sarifPath: typeof r.sarif_path === 'string' ? r.sarif_path : base.sarifPath,
  };
}
