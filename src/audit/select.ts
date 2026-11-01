import { TEST_PATH } from '../scan/types.js';
import type { AuditSlice } from './slices.js';

const FRONTEND = /\.(?:tsx|jsx|vue|svelte|html?)$/i;
const MANIFEST = /(?:^|\/)(?:package\.json|requirements[\w.-]*\.txt|pyproject\.toml|go\.mod|Gemfile|Cargo\.toml|composer\.json)$/;
const LLM_SDK =
  /@anthropic-ai\/sdk|\banthropic\b|\bopenai\b|@google\/genai|google-generativeai|vertexai|langchain|llama[-_]?index|\bollama\b|\bcohere\b|mistralai|bedrock-runtime|"ai"\s*:/i;

/**
 * The slices worth running on this repository.
 *
 * Every slice costs a full agent run. A backend with no templates gets no
 * frontend reviewer; a repository with no model SDK in any manifest gets no
 * LLM reviewer. Everything else always runs: the cost of skipping an
 * authorization review is not a saving anyone wants.
 */
export async function applicableSlices(
  slices: AuditSlice[],
  files: string[],
  read: (path: string) => Promise<string | undefined>,
): Promise<{ run: AuditSlice[]; skipped: Array<{ slice: AuditSlice; why: string }> }> {
  const source = files.filter((f) => !TEST_PATH.test(f));
  const hasFrontend = source.some((f) => FRONTEND.test(f));
  let hasLlm = false;
  for (const m of source.filter((f) => MANIFEST.test(f)).slice(0, 40)) {
    if (LLM_SDK.test((await read(m)) ?? '')) {
      hasLlm = true;
      break;
    }
  }
  const run: AuditSlice[] = [];
  const skipped: Array<{ slice: AuditSlice; why: string }> = [];
  for (const s of slices) {
    if (s.needs === 'frontend' && !hasFrontend) skipped.push({ slice: s, why: 'no frontend source in the repository' });
    else if (s.needs === 'llm' && !hasLlm) skipped.push({ slice: s, why: 'no model SDK in any manifest' });
    else run.push(s);
  }
  return { run, skipped };
}
