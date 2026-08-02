import { describe, it, expect } from 'vitest';
import { loadRepoConfig } from '../../src/github/repoConfig.js';
import type { OctokitLike } from '../../src/github/pr.js';

/** An Octokit that serves one file, or 404s everything. */
function fakeOctokit(files: Record<string, string>): OctokitLike {
  return {
    request: async (_route: string, params: Record<string, unknown>) => {
      const path = String(params.path);
      if (!(path in files)) throw new Error('Not Found');
      return { data: files[path] };
    },
  } as unknown as OctokitLike;
}

const AGENT_YML = `
auto_review: requested
review_behavior: manual
trigger_phrase: "@acme"
max_nits: 2
history: true
history_path: docs/HISTORY.md
history_mode: per_commit
filters:
  - { field: base_branch, operator: equals, value: main }
routines:
  - name: nightly
    skill: commit-summary
    schedule: "0 9 * * *"
`;

describe('reading .github/agent.yml in the Action', () => {
  it('applies every setting from the file', async () => {
    const cfg = await loadRepoConfig(fakeOctokit({ '.github/agent.yml': AGENT_YML }), 'o', 'r');
    expect(cfg.autoReview).toBe('requested');
    expect(cfg.reviewBehavior).toBe('manual');
    expect(cfg.triggerPhrase).toBe('@acme');
    expect(cfg.maxNits).toBe(2);
    expect(cfg.historyEnabled).toBe(true);
    expect(cfg.historyPath).toBe('docs/HISTORY.md');
    expect(cfg.historyMode).toBe('per_commit');
    expect(cfg.filters).toHaveLength(1);
    expect(cfg.routines).toHaveLength(1);
    expect(cfg.routines[0]!.name).toBe('nightly');
  });

  it('falls back to defaults when the file is absent', async () => {
    const cfg = await loadRepoConfig(fakeOctokit({}), 'o', 'r');
    expect(cfg.autoReview).toBe('always');
    expect(cfg.routines).toEqual([]);
  });

  it('also accepts the .yaml spelling', async () => {
    const cfg = await loadRepoConfig(fakeOctokit({ '.github/agent.yaml': 'max_nits: 9' }), 'o', 'r');
    expect(cfg.maxNits).toBe(9);
  });

  it('falls back rather than throwing on malformed YAML', async () => {
    const cfg = await loadRepoConfig(fakeOctokit({ '.github/agent.yml': 'a: [unclosed' }), 'o', 'r');
    expect(cfg.autoReview).toBe('always');
  });

  it('ignores an empty file', async () => {
    const cfg = await loadRepoConfig(fakeOctokit({ '.github/agent.yml': '   \n' }), 'o', 'r');
    expect(cfg.maxNits).toBe(5);
  });

  it('decodes base64 content when the API returns the JSON shape', async () => {
    const octokit = {
      request: async () => ({
        data: { content: Buffer.from('max_nits: 7').toString('base64') },
      }),
    } as unknown as OctokitLike;
    expect((await loadRepoConfig(octokit, 'o', 'r')).maxNits).toBe(7);
  });

  it('never throws, whatever the API does', async () => {
    const octokit = {
      request: async () => {
        throw new Error('500 boom');
      },
    } as unknown as OctokitLike;
    await expect(loadRepoConfig(octokit, 'o', 'r')).resolves.toBeDefined();
  });
});
