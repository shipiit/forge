import { describe, it, expect } from 'vitest';
import { buildDoctorReport, renderDoctorReport } from '../src/doctor.js';

const EMPTY = {} as NodeJS.ProcessEnv;

describe('forge doctor', () => {
  it('defaults the active provider to anthropic and flags it unconfigured', () => {
    const report = buildDoctorReport(EMPTY);
    expect(report.active).toBe('anthropic');
    expect(report.activeOk).toBe(false);
  });

  it('marks the active provider ready once its credential is present', () => {
    const report = buildDoctorReport({ LLM_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-x' } as NodeJS.ProcessEnv);
    expect(report.active).toBe('openai');
    expect(report.activeOk).toBe(true);
  });

  it('never includes the fake provider in the report', () => {
    expect(buildDoctorReport(EMPTY).results.some((r) => r.provider === 'fake')).toBe(false);
  });

  it('parses the fallback chain in order', () => {
    const report = buildDoctorReport({ FORGE_FALLBACK_PROVIDERS: 'bedrock, openai' } as NodeJS.ProcessEnv);
    expect(report.fallbacks).toEqual(['bedrock', 'openai']);
  });

  it('surfaces the effective token and caching settings', () => {
    const report = buildDoctorReport({ FORGE_MAX_OUTPUT_TOKENS: '32000', FORGE_PROMPT_CACHE: '0' } as NodeJS.ProcessEnv);
    const byName = Object.fromEntries(report.settings.map((s) => [s.name, s.value]));
    expect(byName.FORGE_MAX_OUTPUT_TOKENS).toBe('32000');
    expect(byName.FORGE_PROMPT_CACHE).toBe('off');
  });

  it('shows 16384 as the documented default token budget', () => {
    const byName = Object.fromEntries(buildDoctorReport(EMPTY).settings.map((s) => [s.name, s.value]));
    expect(byName.FORGE_MAX_OUTPUT_TOKENS).toContain('16384');
  });

  it('renders a warning when the active provider is unusable', () => {
    const text = renderDoctorReport(buildDoctorReport(EMPTY));
    expect(text).toContain('not configured');
    expect(text).toContain('runs will fail');
  });

  it('never prints credential VALUES, only names', () => {
    const text = renderDoctorReport(
      buildDoctorReport({
        LLM_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: 'sk-ant-do-not-leak-me',
        OPENAI_API_KEY: 'sk-also-secret',
      } as NodeJS.ProcessEnv),
    );
    expect(text).not.toContain('do-not-leak-me');
    expect(text).not.toContain('sk-also-secret');
    expect(text).toContain('ANTHROPIC_API_KEY');
  });

  it('counts ready providers', () => {
    const text = renderDoctorReport(
      buildDoctorReport({ OPENAI_API_KEY: 'x', GROQ_API_KEY: 'y' } as NodeJS.ProcessEnv),
    );
    // openai + groq + ollama (needs nothing) = 3
    expect(text).toContain('3 of 9 providers ready');
  });
});
