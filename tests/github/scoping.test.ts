import { describe, it, expect } from 'vitest';
import { changedFiles, scopeFindingsToDiff, type ReviewFinding } from '../../src/github/review.js';
import { selectTools, parseToolList, editToolset, reviewToolset } from '../../src/agent/tools/registry.js';
import { readActionInputs, applyExtraPrompt } from '../../src/actionInputs.js';

const DIFF = `diff --git a/src/auth.ts b/src/auth.ts
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -1,3 +1,4 @@
 const a = 1;
+const b = 2;
diff --git a/src/removed.ts b/src/removed.ts
--- a/src/removed.ts
+++ /dev/null
`;

const finding = (file: string, over: Partial<ReviewFinding> = {}): ReviewFinding => ({
  file,
  startLine: 1,
  endLine: 2,
  lens: 'quality',
  severity: 'high',
  category: 'bug',
  title: 't',
  body: 'b',
  ...over,
});

describe('review is scoped to the current change', () => {
  it('extracts the changed files, ignoring deletions', () => {
    expect(changedFiles(DIFF)).toEqual(['src/auth.ts']);
  });

  it('keeps findings on changed files and drops the rest', () => {
    const kept = scopeFindingsToDiff(
      [finding('src/auth.ts'), finding('src/unrelated.ts'), finding('README.md')],
      DIFF,
    );
    expect(kept.map((f) => f.file)).toEqual(['src/auth.ts']);
  });

  it('normalizes a leading ./ so paths still match', () => {
    expect(scopeFindingsToDiff([finding('./src/auth.ts')], DIFF)).toHaveLength(1);
  });

  it('keeps a pre-existing finding when it lands on a changed file', () => {
    const kept = scopeFindingsToDiff([finding('src/auth.ts', { preExisting: true })], DIFF);
    expect(kept).toHaveLength(1);
  });

  it('drops a pre-existing finding on a file the change never touched', () => {
    expect(scopeFindingsToDiff([finding('src/other.ts', { preExisting: true })], DIFF)).toHaveLength(0);
  });

  it('does not filter when the diff is empty (nothing known to scope to)', () => {
    const findings = [finding('a.ts')];
    expect(scopeFindingsToDiff(findings, '')).toEqual(findings);
  });
});

describe('tool selection', () => {
  const all = editToolset();
  const names = (list: ReturnType<typeof editToolset>) => list.map((t) => t.spec.name);

  it('returns everything by default', () => {
    expect(selectTools(all)).toHaveLength(all.length);
  });

  it('narrows to an allowlist', () => {
    const picked = selectTools(all, { allowed: ['read_file', 'search'] });
    expect(names(picked).sort()).toEqual(['read_file', 'search']);
  });

  it('removes a denylisted tool — e.g. taking shell away', () => {
    expect(names(selectTools(all, { disallowed: ['run_bash'] }))).not.toContain('run_bash');
  });

  it('applies the denylist after the allowlist', () => {
    const picked = selectTools(all, { allowed: ['read_file', 'run_bash'], disallowed: ['run_bash'] });
    expect(names(picked)).toEqual(['read_file']);
  });

  it('ignores unknown names instead of throwing', () => {
    expect(() => selectTools(all, { allowed: ['nope'], disallowed: ['also_nope'] })).not.toThrow();
  });

  it('falls back to the full set when an allowlist matches nothing', () => {
    // A typo must not leave the agent with zero tools.
    expect(selectTools(all, { allowed: ['typo_tool'] })).toHaveLength(all.length);
  });

  it('shrinks the schema payload, which is what saves tokens', () => {
    const full = JSON.stringify(reviewToolset().map((t) => t.spec)).length;
    const small = JSON.stringify(selectTools(reviewToolset(), { allowed: ['read_file'] }).map((t) => t.spec)).length;
    expect(small).toBeLessThan(full / 2);
  });

  it('parses tool lists from workflow input', () => {
    expect(parseToolList('read_file, search  glob')).toEqual(['read_file', 'search', 'glob']);
    expect(parseToolList(undefined)).toEqual([]);
    expect(parseToolList('   ')).toEqual([]);
  });
});

describe('GitHub Action inputs', () => {
  it('reads nothing when no inputs are set', () => {
    const inputs = readActionInputs({} as NodeJS.ProcessEnv);
    expect(inputs.extraPrompt).toBeUndefined();
    expect(inputs.allowedTools).toEqual([]);
    expect(inputs.maxTurns).toBeUndefined();
  });

  it('maps hyphenated input names to INPUT_ env vars', () => {
    const inputs = readActionInputs({
      INPUT_PROMPT: 'be strict about auth',
      INPUT_ALLOWED_TOOLS: 'read_file search',
      INPUT_DISALLOWED_TOOLS: 'run_bash',
      INPUT_MAX_TURNS: '8',
      INPUT_MAX_NITS: '2',
    } as NodeJS.ProcessEnv);
    expect(inputs.extraPrompt).toBe('be strict about auth');
    expect(inputs.allowedTools).toEqual(['read_file', 'search']);
    expect(inputs.disallowedTools).toEqual(['run_bash']);
    expect(inputs.maxTurns).toBe(8);
    expect(inputs.maxNits).toBe(2);
  });

  it('applies env-backed knobs without clobbering an explicit env value', () => {
    const env = { INPUT_MAX_OUTPUT_TOKENS: '32000' } as NodeJS.ProcessEnv;
    readActionInputs(env);
    expect(env.FORGE_MAX_OUTPUT_TOKENS).toBe('32000');

    const preset = { FORGE_MAX_OUTPUT_TOKENS: '4096', INPUT_MAX_OUTPUT_TOKENS: '32000' } as NodeJS.ProcessEnv;
    readActionInputs(preset);
    expect(preset.FORGE_MAX_OUTPUT_TOKENS).toBe('4096');
  });

  it('routes max-turns to MAX_ITERATIONS', () => {
    const env = { INPUT_MAX_TURNS: '5' } as NodeJS.ProcessEnv;
    readActionInputs(env);
    expect(env.MAX_ITERATIONS).toBe('5');
  });

  it('ignores a non-numeric number input', () => {
    expect(readActionInputs({ INPUT_MAX_TURNS: 'abc' } as NodeJS.ProcessEnv).maxTurns).toBeUndefined();
  });

  it('lowercases the trigger phrase', () => {
    expect(readActionInputs({ INPUT_TRIGGER_PHRASE: '@MyBot' } as NodeJS.ProcessEnv).triggerPhrase).toBe('@mybot');
  });
});

describe('workflow-supplied prompt', () => {
  it('is a no-op when unset', () => {
    expect(applyExtraPrompt('BASE')).toBe('BASE');
    expect(applyExtraPrompt('BASE', '')).toBe('BASE');
  });

  it('appends after the base so it takes precedence', () => {
    const out = applyExtraPrompt('BASE', 'ONLY report security issues');
    expect(out.indexOf('BASE')).toBeLessThan(out.indexOf('ONLY report security issues'));
    expect(out).toContain('take precedence');
  });
});
