import { parseToolList } from './agent/tools/registry.js';
import type { Skill } from './agent/skills.js';

/**
 * GitHub Actions inputs → runtime settings.
 *
 * Actions exposes an input named `foo-bar` as `INPUT_FOO_BAR`. Everything here
 * is optional: with no inputs at all the behaviour is exactly the pre-existing
 * default, so adding this can't change how existing workflows run.
 *
 * Several inputs are applied by writing the corresponding env var, because that
 * is where the adapters and loop already read them from — one source of truth
 * rather than a second parallel config path.
 */

export interface ActionInputs {
  provider?: string;
  model?: string;
  /** Extra instructions appended to the system prompt. */
  extraPrompt?: string;
  allowedTools: string[];
  disallowedTools: string[];
  maxTurns?: number;
  maxNits?: number;
  triggerPhrase?: string;
  /** Name of a skill to run for this workflow (built-in or repo-committed). */
  skillName?: string;
  /** A skill defined inline in the workflow, needing no committed file. */
  inlineSkill?: Skill;
  /** Extra directory to load committed skills from. */
  skillsPath?: string;
}

function input(name: string, env: NodeJS.ProcessEnv): string | undefined {
  const key = `INPUT_${name.toUpperCase().replace(/-/g, '_')}`;
  const v = env[key];
  return v && v.trim() ? v.trim() : undefined;
}

function num(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

/**
 * Read inputs and apply the env-backed ones. Returns the settings that callers
 * must thread through explicitly (prompt, tools, turns).
 */
export function readActionInputs(env: NodeJS.ProcessEnv = process.env): ActionInputs {
  const set = (name: string, value: string | undefined) => {
    if (value !== undefined && !env[name]) env[name] = value;
  };

  // Env-backed knobs — read where they already belong.
  set('FORGE_MAX_OUTPUT_TOKENS', input('max-output-tokens', env));
  set('FORGE_PROMPT_CACHE', input('prompt-cache', env));
  set('FORGE_THINKING_BUDGET', input('thinking-budget', env));
  set('FORGE_FALLBACK_PROVIDERS', input('fallback-providers', env));
  set('ANTHROPIC_API_KEY', input('anthropic-api-key', env));
  set('OPENAI_API_KEY', input('openai-api-key', env));
  set('GEMINI_API_KEY', input('gemini-api-key', env));

  const maxTurns = num(input('max-turns', env));
  if (maxTurns !== undefined) set('MAX_ITERATIONS', String(maxTurns));

  const triggerPhrase = input('trigger-phrase', env)?.toLowerCase();
  if (triggerPhrase) set('FORGE_DISPLAY_HANDLE', triggerPhrase);

  // A skill can be defined right in the workflow — no committed file needed.
  // This is how an admin adds a team-wide skill without touching the repo.
  const skillPrompt = input('skill-prompt', env);
  const skillName = input('skill-name', env) ?? input('skill', env);
  const inlineSkill: Skill | undefined = skillPrompt
    ? {
        name: (input('skill-name', env) ?? 'workflow-skill').toLowerCase(),
        description: input('skill-description', env) ?? 'Defined in the workflow file.',
        prompt: skillPrompt,
        ...(input('skill-tools', env) ? { tools: parseToolList(input('skill-tools', env)) } : {}),
      }
    : undefined;

  return {
    provider: input('provider', env),
    model: input('model', env),
    extraPrompt: input('prompt', env),
    allowedTools: parseToolList(input('allowed-tools', env)),
    disallowedTools: parseToolList(input('disallowed-tools', env)),
    maxTurns,
    maxNits: num(input('max-nits', env)),
    triggerPhrase,
    skillName: skillName?.replace(/^\//, '').toLowerCase(),
    inlineSkill,
    skillsPath: input('skills-path', env),
  };
}

/**
 * Append workflow-supplied instructions to a base system prompt. They go last
 * and are labelled, so they take precedence over the built-in guidance the same
 * way REVIEW.md does for reviews.
 */
export function applyExtraPrompt(base: string, extra?: string): string {
  if (!extra) return base;
  return (
    `${base}\n\n# Additional instructions for this run\n\n` +
    `These come from the workflow that started this run and take precedence over ` +
    `the general guidance above.\n\n${extra}`
  );
}
