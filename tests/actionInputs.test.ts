import { describe, it, expect } from 'vitest';
import { actionInput, readActionInputs } from '../src/actionInputs.js';


describe('the env var names the runner actually sets', () => {
  // Proven by a real run: the runner logged `-e "INPUT_VERTEX-CREDENTIALS-JSON"`.
  // Actions uppercases an input name and replaces spaces, and keeps dashes.
  // Reading the all-underscore spelling meant every multi-word input — every
  // credential — was silently empty, and the workflow failed with "Missing
  // credentials" while looking correctly configured.
  it('reads a dashed input under the name the runner exports', () => {
    const env = { 'INPUT_VERTEX-CREDENTIALS-JSON': '{"type":"service_account"}' } as NodeJS.ProcessEnv;
    expect(actionInput('vertex-credentials-json', env)).toBe('{"type":"service_account"}');
  });

  it('still accepts the underscore spelling, for anyone who worked around it', () => {
    const env = { INPUT_VERTEX_CREDENTIALS_JSON: 'x' } as NodeJS.ProcessEnv;
    expect(actionInput('vertex-credentials-json', env)).toBe('x');
  });

  it('prefers the runner spelling when both are present', () => {
    const env = {
      'INPUT_ANTHROPIC-API-KEY': 'from-runner',
      INPUT_ANTHROPIC_API_KEY: 'from-workaround',
    } as NodeJS.ProcessEnv;
    expect(actionInput('anthropic-api-key', env)).toBe('from-runner');
  });

  it('carries every credential input through to the environment the adapters read', () => {
    const env = {
      'INPUT_ANTHROPIC-API-KEY': 'a',
      'INPUT_OPENAI-API-KEY': 'o',
      'INPUT_GEMINI-API-KEY': 'g',
    } as NodeJS.ProcessEnv;
    readActionInputs(env);
    expect(env.ANTHROPIC_API_KEY).toBe('a');
    expect(env.OPENAI_API_KEY).toBe('o');
    expect(env.GEMINI_API_KEY).toBe('g');
  });

  it('leaves single-word inputs working, which is why this went unnoticed', () => {
    expect(actionInput('provider', { INPUT_PROVIDER: 'vertex' } as NodeJS.ProcessEnv)).toBe('vertex');
  });
});
