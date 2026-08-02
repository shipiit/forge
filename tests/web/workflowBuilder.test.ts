import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CONFIG,
  branchList,
  generateAgentYml,
  generateWorkflow,
  needsAgentYml,
  permissionsFor,
  validate,
  type WorkflowConfig,
} from '../../web/src/components/workflow/generateWorkflow.js';
import { PROVIDERS, providerMeta } from '../../web/src/components/workflow/providers.js';

const cfg = (over: Partial<WorkflowConfig> = {}): WorkflowConfig => ({ ...DEFAULT_CONFIG, ...over });

describe('provider metadata', () => {
  it('covers every provider the agent supports', () => {
    const ids = PROVIDERS.map((p) => p.id);
    for (const expected of [
      'anthropic', 'openai', 'gemini', 'vertex', 'bedrock',
      'groq', 'together', 'ollama', 'openai-compatible',
    ]) {
      expect(ids).toContain(expected);
    }
  });

  it('gives each provider its own default model, not a shared one', () => {
    expect(providerMeta('anthropic').defaultModel).toMatch(/claude/);
    expect(providerMeta('openai').defaultModel).toMatch(/gpt/);
    expect(providerMeta('vertex').defaultModel).toMatch(/gemini/);
    expect(providerMeta('bedrock').defaultModel).toMatch(/anthropic\./);
    expect(providerMeta('ollama').defaultModel).toMatch(/llama/);
  });

  it('only claims a secret input where the Action actually has one', () => {
    expect(providerMeta('anthropic').secretInput).toBe('anthropic-api-key');
    expect(providerMeta('vertex').secretInput).toBe('vertex-credentials-json');
    // These read credentials from the environment / cloud chain instead.
    expect(providerMeta('bedrock').secretInput).toBe('');
    expect(providerMeta('ollama').secretInput).toBe('');
  });

  it('falls back to the first provider for an unknown id', () => {
    expect(providerMeta('nope').id).toBe('anthropic');
  });

  it('explains itself wherever there is no key field', () => {
    for (const p of PROVIDERS.filter((p) => !p.secretInput)) {
      expect(p.credentialNote, `${p.id} needs a note`).toBeTruthy();
    }
  });
});

describe('validation', () => {
  it('accepts the default configuration', () => {
    expect(validate(DEFAULT_CONFIG)).toEqual([]);
  });

  it('requires a name', () => {
    expect(validate(cfg({ name: '  ' })).map((i) => i.field)).toContain('name');
  });

  it('requires a secret name only when the provider takes one', () => {
    expect(validate(cfg({ secretName: '' })).map((i) => i.field)).toContain('secretName');
    // Ollama has no secret input, so an empty name is fine.
    expect(validate(cfg({ provider: 'ollama', secretName: '' })).map((i) => i.field)).not.toContain('secretName');
  });

  it('requires the provider-specific env vars', () => {
    const vertex = validate(cfg({ provider: 'vertex', secretName: 'V' }));
    expect(vertex.map((i) => i.field)).toContain('VERTEX_PROJECT');
    // Location is optional — it has a documented default.
    expect(vertex.map((i) => i.field)).not.toContain('VERTEX_LOCATION');

    const ok = validate(cfg({ provider: 'vertex', secretName: 'V', env: { VERTEX_PROJECT: 'p' } }));
    expect(ok).toEqual([]);
  });

  it('requires a base URL and model for a compatible endpoint', () => {
    const fields = validate(cfg({ provider: 'openai-compatible' })).map((i) => i.field);
    expect(fields).toContain('OPENAI_COMPATIBLE_BASE_URL');
    expect(fields).toContain('OPENAI_COMPATIBLE_MODEL');
  });

  it('requires a region for Bedrock', () => {
    expect(validate(cfg({ provider: 'bedrock' })).map((i) => i.field)).toContain('AWS_REGION');
  });

  it('needs at least one event, unless there is a schedule', () => {
    expect(validate(cfg({ events: [] })).map((i) => i.field)).toContain('events');
    expect(validate(cfg({ events: [], schedule: '0 9 * * *' })).map((i) => i.field)).not.toContain('events');
  });

  it('rejects a malformed cron expression', () => {
    expect(validate(cfg({ schedule: '0 9 *' })).map((i) => i.field)).toContain('schedule');
    expect(validate(cfg({ schedule: '0 9 * * *' })).map((i) => i.field)).not.toContain('schedule');
  });

  it('rejects non-numeric limits', () => {
    expect(validate(cfg({ maxTurns: 'ten' })).map((i) => i.field)).toContain('maxTurns');
    expect(validate(cfg({ maxOutputTokens: 'lots' })).map((i) => i.field)).toContain('maxOutputTokens');
    expect(validate(cfg({ maxTurns: '10', maxOutputTokens: '8192' }))).toEqual([]);
  });
});

describe('generated workflow', () => {
  it('emits a valid-looking skeleton with the defaults', () => {
    const yaml = generateWorkflow(DEFAULT_CONFIG);
    expect(yaml).toContain('name: ShipIT Forge');
    expect(yaml).toContain('on:');
    expect(yaml).toContain('permissions:');
    expect(yaml).toContain('jobs:');
    expect(yaml).toContain('- uses: shipiit/forge@v1');
    expect(yaml.endsWith('\n')).toBe(true);
  });

  it('wires the credential input the provider actually expects', () => {
    expect(generateWorkflow(cfg({ provider: 'anthropic', secretName: 'MY_KEY' }))).toContain(
      'anthropic-api-key: ${{ secrets.MY_KEY }}',
    );
    expect(generateWorkflow(cfg({ provider: 'openai', secretName: 'OAI' }))).toContain(
      'openai-api-key: ${{ secrets.OAI }}',
    );
  });

  it('emits an env block for provider-specific variables', () => {
    const yaml = generateWorkflow(
      cfg({ provider: 'vertex', secretName: 'V', env: { VERTEX_PROJECT: 'my-proj', VERTEX_LOCATION: 'us-east5' } }),
    );
    expect(yaml).toContain('env:');
    expect(yaml).toContain('VERTEX_PROJECT: my-proj');
    expect(yaml).toContain('VERTEX_LOCATION: us-east5');
  });

  it('omits an env var the user left empty', () => {
    const yaml = generateWorkflow(cfg({ provider: 'vertex', secretName: 'V', env: { VERTEX_PROJECT: 'p' } }));
    expect(yaml).toContain('VERTEX_PROJECT: p');
    expect(yaml).not.toContain('VERTEX_LOCATION');
  });

  it('adds the OIDC step and id-token permission for Bedrock', () => {
    const yaml = generateWorkflow(cfg({ provider: 'bedrock', env: { AWS_REGION: 'eu-west-1' } }));
    expect(yaml).toContain('aws-actions/configure-aws-credentials@v4');
    expect(yaml).toContain('aws-region: eu-west-1');
    expect(yaml).toContain('id-token: write');
    expect(yaml).not.toContain('anthropic-api-key');
  });

  it('adds checks: write only when reviewing pull requests', () => {
    expect(permissionsFor(['pull_request'])).toContain('checks: write');
    expect(permissionsFor(['issues'])).not.toContain('checks: write');
  });

  it('adds workflow_dispatch alongside a schedule', () => {
    const yaml = generateWorkflow(cfg({ schedule: '0 9 * * *' }));
    expect(yaml).toContain("- cron: '0 9 * * *'");
    expect(yaml).toContain('workflow_dispatch:');
  });

  it('includes optional inputs only when set', () => {
    const bare = generateWorkflow(DEFAULT_CONFIG);
    expect(bare).not.toContain('max-turns');
    expect(bare).not.toContain('skill:');
    expect(bare).not.toContain('allowed-tools');

    const full = generateWorkflow(
      cfg({ skill: 'code-review', allowedTools: ['read_file', 'search'], maxTurns: '10', maxNits: '3' }),
    );
    expect(full).toContain('skill: code-review');
    expect(full).toContain('allowed-tools: read_file search');
    expect(full).toContain('max-turns: "10"');
    expect(full).toContain('max-nits: "3"');
  });

  it('only disables prompt caching when explicitly turned off', () => {
    expect(generateWorkflow(DEFAULT_CONFIG)).not.toContain('prompt-cache');
    expect(generateWorkflow(cfg({ promptCache: false }))).toContain('prompt-cache: "0"');
  });

  it('indents a multi-line prompt as a YAML literal block', () => {
    const yaml = generateWorkflow(cfg({ prompt: 'line one\nline two' }));
    expect(yaml).toContain('prompt: |');
    expect(yaml).toContain('            line one');
    expect(yaml).toContain('            line two');
  });

  it('adds the App token step when committing as an App', () => {
    const yaml = generateWorkflow(cfg({ useApp: true }));
    expect(yaml).toContain('actions/create-github-app-token@v2');
    expect(yaml).toContain('github-token: ${{ steps.app-token.outputs.token }}');
  });

  it('quotes a name containing YAML specials', () => {
    expect(generateWorkflow(cfg({ name: 'Forge: review' }))).toContain('name: "Forge: review"');
  });

  it('is deterministic — the same config always yields the same file', () => {
    const c = cfg({ provider: 'vertex', secretName: 'V', env: { VERTEX_PROJECT: 'p' } });
    expect(generateWorkflow(c)).toBe(generateWorkflow(c));
  });

  it('produces a runnable file for every provider once its requirements are met', () => {
    for (const p of PROVIDERS) {
      const env: Record<string, string> = {};
      for (const e of p.extraEnv) env[e.name] = e.placeholder;
      const c = cfg({ provider: p.id, secretName: p.defaultSecret || 'X', env });
      expect(validate(c), `${p.id} should validate`).toEqual([]);
      const yaml = generateWorkflow(c);
      expect(yaml, `${p.id} should name its provider`).toContain(`provider: ${p.id}`);
    }
  });
});

describe('routine file for scheduled runs', () => {
  it('is not generated without a schedule', () => {
    expect(needsAgentYml(DEFAULT_CONFIG)).toBe(false);
    expect(generateAgentYml(DEFAULT_CONFIG)).toBe('');
  });

  it('is generated as soon as a schedule is set', () => {
    const c = cfg({ schedule: '0 9 * * *', routineName: 'nightly-digest' });
    expect(needsAgentYml(c)).toBe(true);
    const yml = generateAgentYml(c);
    expect(yml).toContain('routines:');
    expect(yml).toContain('- name: nightly-digest');
    expect(yml).toContain('schedule: "0 9 * * *"');
  });

  it('keeps the routine runnable on demand', () => {
    expect(generateAgentYml(cfg({ schedule: '0 9 * * *' }))).toContain('manual: true');
  });

  it('carries the chosen skill, prompt, and tools into the routine', () => {
    const yml = generateAgentYml(
      cfg({
        schedule: '0 9 * * *',
        skill: 'commit-summary',
        prompt: 'Summarize yesterday.',
        allowedTools: ['read_file', 'search'],
      }),
    );
    expect(yml).toContain('skill: commit-summary');
    expect(yml).toContain('Summarize yesterday.');
    expect(yml).toContain('tools: [read_file, search]');
  });

  it('sanitizes a routine name into something /run can address', () => {
    expect(generateAgentYml(cfg({ schedule: '0 9 * * *', routineName: 'Nightly Digest!' }))).toContain(
      '- name: nightly-digest-',
    );
  });

  it('defaults to read-only', () => {
    expect(generateAgentYml(cfg({ schedule: '0 9 * * *' }))).toContain('write: false');
  });
});

describe('change history and branch options', () => {
  it('is off by default', () => {
    expect(generateWorkflow(DEFAULT_CONFIG)).not.toContain('push:');
    expect(generateAgentYml(DEFAULT_CONFIG)).toBe('');
  });

  it('adds the push trigger for the documented branches', () => {
    const yaml = generateWorkflow(cfg({ history: true, historyBranches: 'main, develop' }));
    expect(yaml).toContain('push: { branches: [main, develop] }');
  });

  it('writes the history settings into agent.yml', () => {
    const yml = generateAgentYml(cfg({ history: true, historyPath: 'docs/HISTORY.md' }));
    expect(yml).toContain('history: true');
    expect(yml).toContain('history_path: docs/HISTORY.md');
  });

  it('requires a path and a branch when history is on', () => {
    const fields = validate(cfg({ history: true, historyPath: '', historyBranches: '' })).map((i) => i.field);
    expect(fields).toContain('historyPath');
    expect(fields).toContain('historyBranches');
  });

  it('emits an equals filter for one base branch, is_one_of for several', () => {
    expect(generateAgentYml(cfg({ baseBranches: 'main' }))).toContain(
      '{ field: base_branch, operator: equals, value: main }',
    );
    expect(generateAgentYml(cfg({ baseBranches: 'main, develop' }))).toContain(
      '{ field: base_branch, operator: is_one_of, value: [main, develop] }',
    );
  });

  it('parses a branch list from commas or spaces', () => {
    expect(branchList('main, develop  release/*')).toEqual(['main', 'develop', 'release/*']);
    expect(branchList('   ')).toEqual([]);
  });

  it('combines history, filters, and a routine in one agent.yml', () => {
    const yml = generateAgentYml(
      cfg({ history: true, baseBranches: 'develop', schedule: '0 9 * * *', routineName: 'digest' }),
    );
    expect(yml).toContain('history: true');
    expect(yml).toContain('base_branch');
    expect(yml).toContain('- name: digest');
  });
});
