import { describe, it, expect } from 'vitest';
import { mergeConfig, defaultConfig } from '../src/config.js';

describe('config', () => {
  it('provides sensible defaults', () => {
    const c = defaultConfig({});
    expect(c.triggerLabel).toBe('agent-fix');
    expect(c.autoFix).toBe('label');
    expect(c.autoReview).toBe('always');
    expect(c.reviewDepth).toBe('standard');
    expect(c.ignorePaths).toEqual([]);
  });

  it('seeds defaults from environment variables', () => {
    const c = defaultConfig({ FORGE_AUTO_FIX: 'opened', FORGE_TRIGGER_LABEL: 'bot-fix', FORGE_MODEL: 'gemini-2.5-pro' });
    expect(c.autoFix).toBe('opened');
    expect(c.triggerLabel).toBe('bot-fix');
    expect(c.model).toBe('gemini-2.5-pro');
  });

  it('merges a repo config over defaults', () => {
    const c = mergeConfig(
      { model: 'gpt-4o', trigger_label: 'fixme', auto_review: 'requested', test_command: 'pnpm test', ignore_paths: ['dist/**'] },
      defaultConfig({}),
    );
    expect(c.model).toBe('gpt-4o');
    expect(c.triggerLabel).toBe('fixme');
    expect(c.autoReview).toBe('requested');
    expect(c.testCommand).toBe('pnpm test');
    expect(c.ignorePaths).toEqual(['dist/**']);
  });

  it('ignores invalid enum values and non-string ignore paths', () => {
    const c = mergeConfig({ auto_fix: 'banana', review_depth: 5, ignore_paths: ['ok', 123] }, defaultConfig({}));
    expect(c.autoFix).toBe('label'); // fell back to default
    expect(c.reviewDepth).toBe('standard');
    expect(c.ignorePaths).toEqual(['ok']);
  });

  it('tolerates null/garbage raw config', () => {
    expect(mergeConfig(null).triggerLabel).toBe('agent-fix');
    expect(mergeConfig('not an object').autoFix).toBe('label');
  });
});

describe('spend cap and rate limit config', () => {
  it('defaults to no cap and no limit', () => {
    const c = defaultConfig({} as NodeJS.ProcessEnv);
    expect(c.spendCapPerRunUsd).toBe(Infinity);
    expect(c.maxRunsPerHour).toBe(0);
  });

  it('reads both from the environment', () => {
    const c = defaultConfig({
      FORGE_SPEND_CAP_RUN: '2.50',
      FORGE_MAX_RUNS_PER_HOUR: '20',
    } as NodeJS.ProcessEnv);
    expect(c.spendCapPerRunUsd).toBe(2.5);
    expect(c.maxRunsPerHour).toBe(20);
  });

  it('lets a repository override both', () => {
    const c = mergeConfig(
      { spend_cap_per_run_usd: 1.25, max_runs_per_hour: 6 },
      defaultConfig({} as NodeJS.ProcessEnv),
    );
    expect(c.spendCapPerRunUsd).toBe(1.25);
    expect(c.maxRunsPerHour).toBe(6);
  });

  it('ignores a nonsensical cap rather than spending nothing', () => {
    const c = mergeConfig({ spend_cap_per_run_usd: 0 }, defaultConfig({} as NodeJS.ProcessEnv));
    expect(c.spendCapPerRunUsd).toBe(Infinity);
  });
});
