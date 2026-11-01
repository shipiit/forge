import { runAgent } from '../agent/loop.js';
import { reviewSystemPrompt, verifySystemPrompt } from '../agent/prompts.js';
import { reviewToolset } from '../agent/tools/registry.js';
import { reviewPasses, type ReviewDepth } from '../github/verify.js';
import type { ReviewFinding } from '../github/review.js';
import type { LLMClient, ProviderId } from '../providers/types.js';
import type { EvalCase } from './types.js';

/**
 * The model half of the corpus.
 *
 * Each case is reviewed the way a pull request is: its files arrive as a diff
 * that adds them, the finders run at the requested depth, and the verifier
 * checks what they report. What comes out is scored like the scanners' output,
 * so a prompt edit or a cheaper model shows up as a number that moved.
 */

const PROVIDER_IDS: readonly ProviderId[] = [
  'anthropic', 'openai', 'vertex', 'bedrock', 'gemini', 'groq', 'together', 'ollama', 'openai-compatible', 'fake',
];

export function isProviderId(s: string): s is ProviderId {
  return PROVIDER_IDS.some((p) => p === s);
}

/** A diff that adds every file of the case, so every line is reviewable. */
export function newFileDiff(files: Record<string, string>): string {
  return Object.entries(files)
    .map(([rel, text]) => {
      const lines = text.endsWith('\n') ? text.slice(0, -1).split('\n') : text.split('\n');
      return [
        `diff --git a/${rel} b/${rel}`,
        'new file mode 100644',
        '--- /dev/null',
        `+++ b/${rel}`,
        `@@ -0,0 +1,${lines.length} @@`,
        ...lines.map((l) => `+${l}`),
      ].join('\n');
    })
    .join('\n');
}

export interface ModelReviewerOptions {
  client: LLMClient;
  depth: ReviewDepth;
  maxIterations?: number;
  log?: (msg: string) => void;
}

/** A `review` function for `runSuite`, backed by a real model. */
export function modelReviewer(opts: ModelReviewerOptions): (dir: string, kase: EvalCase) => Promise<ReviewFinding[]> {
  const log = opts.log ?? (() => {});
  const limits = { maxIterations: opts.maxIterations ?? 15, maxOutputTokens: 8192 };
  return async (dir, kase) => {
    const diff = newFileDiff(kase.files);
    const outcome = await reviewPasses({
      depth: opts.depth,
      log: (m) => log(`${kase.name}: ${m}`),
      find: (focus) =>
        runAgent({
          client: opts.client,
          system: reviewSystemPrompt(),
          initialContent: [
            { type: 'text', text: `Review this pull request.\n\n${diff}` },
            ...(focus ? [{ type: 'text' as const, text: focus }] : []),
          ],
          tools: reviewToolset(),
          limits,
          cwd: dir,
        }),
      verify: (candidates) =>
        runAgent({
          client: opts.client,
          system: verifySystemPrompt(),
          initialContent: [{ type: 'text', text: `The pull request diff:\n\n${diff}\n\nCandidate findings:\n\n${candidates}` }],
          tools: reviewToolset(),
          limits,
          cwd: dir,
        }),
    });
    return outcome.findings;
  };
}
