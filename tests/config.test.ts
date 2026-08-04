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

describe('publishing what a run cost', () => {
  it('prints the footer by default', () => {
    expect(defaultConfig({} as NodeJS.ProcessEnv).showCost).toBe(true);
  });

  it('can be switched off, so a public repo need not publish its spend', () => {
    // The run is still recorded either way — the number is unpublished, not lost.
    expect(defaultConfig({ FORGE_SHOW_COST: '0' } as NodeJS.ProcessEnv).showCost).toBe(false);
    expect(defaultConfig({ FORGE_SHOW_COST: 'false' } as NodeJS.ProcessEnv).showCost).toBe(false);
  });

  it('is overridable per repository in agent.yml', () => {
    expect(mergeConfig({ show_cost: false }, { FORGE_SHOW_COST: '1' } as NodeJS.ProcessEnv).showCost).toBe(false);
  });
});

describe('scanning for credentials before a merge', () => {
  it('is on by default — the cost of missing one is unbounded and the scan is free', () => {
    expect(defaultConfig({} as NodeJS.ProcessEnv).secretScan).toBe(true);
  });

  it('can be switched off by env or per repository', () => {
    expect(defaultConfig({ FORGE_SECRET_SCAN: '0' } as NodeJS.ProcessEnv).secretScan).toBe(false);
    expect(mergeConfig({ secret_scan: false }, {} as NodeJS.ProcessEnv).secretScan).toBe(false);
  });
});

describe('the code scan toggle', () => {
  it('is on unless somebody turns it off', () => {
    expect(defaultConfig({}).codeScan).toBe(true);
    expect(defaultConfig({ FORGE_CODE_SCAN: '0' } as NodeJS.ProcessEnv).codeScan).toBe(false);
    expect(defaultConfig({ FORGE_CODE_SCAN: 'false' } as NodeJS.ProcessEnv).codeScan).toBe(false);
  });

  it('can be switched off in the repository config, independently of secrets', () => {
    const c = mergeConfig({ code_scan: false }, defaultConfig({}));
    expect(c.codeScan).toBe(false);
    expect(c.secretScan).toBe(true);
  });
});

describe('what the scan blocks on', () => {
  it('defaults to high — real things stop a merge, arguments do not', () => {
    expect(defaultConfig({}).scanBlockOn).toBe('high');
  });

  it('takes low, for a repository that wants nothing outstanding', () => {
    expect(mergeConfig({ scan_block_on: 'low' }, defaultConfig({})).scanBlockOn).toBe('low');
    expect(defaultConfig({ FORGE_SCAN_BLOCK_ON: 'none' } as NodeJS.ProcessEnv).scanBlockOn).toBe('none');
  });

  it('ignores a value that is not a severity rather than blocking on nonsense', () => {
    expect(mergeConfig({ scan_block_on: 'urgent' }, defaultConfig({})).scanBlockOn).toBe('high');
  });
});
