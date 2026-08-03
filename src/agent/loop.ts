import type { ContentPart, LLMClient, Msg, Usage } from '../providers/types.js';
import { type Tool, type ToolContext, type SecurityScannerLike } from './tools/types.js';
import { indexTools } from './tools/registry.js';
import { withRetry } from '../util/resilience.js';
import { addUsage, estimateCost } from '../util/cost.js';
import { NO_CAP, budgetState, wouldExceed, type BudgetState } from '../util/budget.js';
import { compactMessages } from './compaction.js';

/**
 * Default output-token budget for a single model turn, shared by every flow.
 * Override per-deployment with FORGE_MAX_OUTPUT_TOKENS (e.g. lower it for models
 * whose hard cap is smaller, like Claude 3.5 Sonnet on Bedrock at 8192).
 */
export const DEFAULT_MAX_OUTPUT_TOKENS = Number(process.env.FORGE_MAX_OUTPUT_TOKENS || 16384);

export interface AgentLimits {
  maxIterations: number;
  maxOutputTokens: number;
  /**
   * USD ceiling for this run. Omit or pass Infinity for no cap.
   *
   * maxIterations bounds turns, which is not the same as bounding cost — the
   * same turn count is a very different bill on a large repository or an
   * expensive model.
   */
  maxSpendUsd?: number;
}

export interface AgentResult {
  finalText: string;
  iterations: number;
  /** `budget` means it stopped early because the spend cap was reached. */
  stoppedBy: 'end' | 'limit' | 'budget';
  messages: Msg[];
  usage: Usage;
  /** Set when stoppedBy is 'budget'; what it had spent when it stopped. */
  budget?: BudgetState;
}

export interface RunAgentOptions {
  client: LLMClient;
  system: string;
  /** Initial user content (task text, issue body, extracted images, diff, …). */
  initialContent: ContentPart[];
  tools: Tool[];
  limits: AgentLimits;
  cwd: string;
  /** Optional per-run security scanner; every write is checked against it. */
  security?: SecurityScannerLike;
  /** Optional callback for progress logging (tool calls, iterations). */
  onEvent?: (event: AgentEvent) => void;
}

export type AgentEvent =
  | { type: 'iteration'; n: number }
  | { type: 'tool'; name: string; args: Record<string, unknown> }
  | { type: 'tool_done'; name: string; turnIdx: number; durationMs: number; ok: boolean; error?: string; outputBytes: number }
  | { type: 'turn'; idx: number; startedAt: number; latencyMs: number; usage: Usage; stopReason: string; reasoningChars?: number }
  | { type: 'tool_error'; name: string; message: string }
  | { type: 'assistant_text'; text: string }
  | { type: 'compacted'; savedChars: number }
  | { type: 'budget'; spentUsd: number; capUsd: number };

/**
 * Drive the model/tool loop until the model finishes or limits are hit.
 *
 * Each turn: call the model; if it requests tools, run them, feed the results
 * back, and continue. The assistant's tool_use turn and the resulting
 * tool_result turn are both recorded so providers can round-trip correctly.
 */
export async function runAgent(opts: RunAgentOptions): Promise<AgentResult> {
  const { client, system, initialContent, tools, limits, cwd, security, onEvent } = opts;
  const byName = indexTools(tools);
  const toolSpecs = tools.map((t) => t.spec);
  const ctx: ToolContext = { cwd, supportsVision: client.supportsVision, ...(security ? { security } : {}) };

  let messages: Msg[] = [{ role: 'user', content: initialContent }];
  let usage: Usage = { inputTokens: 0, outputTokens: 0 };
  let finalText = '';
  const capUsd = limits.maxSpendUsd ?? NO_CAP;
  let nudged = false; // ensure the model actually writes a final answer if it ends empty

  for (let n = 1; n <= limits.maxIterations; n++) {
    onEvent?.({ type: 'iteration', n });

    // Elide stale tool output once the transcript is genuinely large. Rewriting
    // history costs the cached prefix, so this only fires when resending the
    // full transcript would cost more than rebuilding the cache.
    const compaction = compactMessages(messages);
    if (compaction.compacted) {
      messages = compaction.messages;
      onEvent?.({ type: 'compacted', savedChars: compaction.savedChars });
    }

    const turnStartedAt = Date.now();
    const res = await withRetry(() => client.chat({ system, messages, tools: toolSpecs, maxTokens: limits.maxOutputTokens }));
    onEvent?.({
      type: 'turn',
      idx: n,
      startedAt: turnStartedAt,
      latencyMs: Date.now() - turnStartedAt,
      usage: res.usage,
      stopReason: res.stopReason,
      ...(res.reasoning ? { reasoningChars: res.reasoning.length } : {}),
    });
    const turnUsd = estimateCost(res.usage, client.model).usd;
    usage = addUsage(usage, res.usage);

    // Spend cap. Checked after the turn that was already paid for, and again
    // projected forward, so the run stops *before* an overspend rather than
    // discovering it afterwards.
    const budget = budgetState(usage, client.model, capUsd);
    if (budget.exceeded || wouldExceed(budget, turnUsd)) {
      onEvent?.({ type: 'budget', spentUsd: budget.spentUsd, capUsd: budget.capUsd });
      if (res.text) finalText = res.text;
      return { finalText, iterations: n, stoppedBy: 'budget', messages, usage, budget };
    }

    // Record the assistant turn (text + any tool_use calls).
    const assistantParts: ContentPart[] = [];
    if (res.text) assistantParts.push({ type: 'text', text: res.text });
    for (const call of res.toolCalls) {
      assistantParts.push({ type: 'tool_use', id: call.id, name: call.name, args: call.args });
    }
    if (assistantParts.length > 0) messages.push({ role: 'assistant', content: assistantParts });
    if (res.text) {
      finalText = res.text;
      onEvent?.({ type: 'assistant_text', text: res.text });
    }

    if (res.toolCalls.length === 0 || res.stopReason === 'end') {
      // Self-correct: the model tried to finish but produced no text. Nudge it once
      // to actually write the answer instead of returning an empty result.
      if (!finalText.trim() && !nudged) {
        nudged = true;
        messages.push({
          role: 'user',
          content: [{ type: 'text', text: 'You have not written your final answer yet. Write it now, in full, as instructed.' }],
        });
        continue;
      }
      return { finalText, iterations: n, stoppedBy: 'end', messages, usage };
    }

    // Execute each requested tool and feed results back as one user turn.
    const resultParts: ContentPart[] = [];
    for (const call of res.toolCalls) {
      onEvent?.({ type: 'tool', name: call.name, args: call.args });
      const tool = byName.get(call.name);
      if (!tool) {
        resultParts.push({ type: 'tool_result', toolCallId: call.id, content: `Unknown tool: ${call.name}`, isError: true });
        continue;
      }
      const toolStartedAt = Date.now();
      try {
        const parts = await tool.run(call.args, ctx);
        const normalized = normalizeToolResult(call.id, parts);
        resultParts.push(...normalized);
        onEvent?.({
          type: 'tool_done',
          name: call.name,
          turnIdx: n,
          durationMs: Date.now() - toolStartedAt,
          ok: true,
          outputBytes: normalized.reduce((sum, p) => sum + ('content' in p ? p.content.length : 0), 0),
        });
      } catch (err) {
        const message = (err as Error).message;
        onEvent?.({ type: 'tool_error', name: call.name, message });
        onEvent?.({
          type: 'tool_done',
          name: call.name,
          turnIdx: n,
          durationMs: Date.now() - toolStartedAt,
          ok: false,
          error: message,
          outputBytes: 0,
        });
        resultParts.push({ type: 'tool_result', toolCallId: call.id, content: `Error: ${message}`, isError: true });
      }
    }
    messages.push({ role: 'user', content: resultParts });
  }

  return { finalText, iterations: limits.maxIterations, stoppedBy: 'limit', messages, usage };
}

/**
 * Tools may return text/image parts or pre-built tool_result parts (with an empty
 * toolCallId). Stamp the correct call id and wrap loose text/image parts in a
 * tool_result so every part is correctly attributed.
 */
function normalizeToolResult(callId: string, parts: ContentPart[]): ContentPart[] {
  const textChunks: string[] = [];
  const out: ContentPart[] = [];
  for (const part of parts) {
    if (part.type === 'tool_result') {
      out.push({ ...part, toolCallId: callId });
    } else if (part.type === 'image') {
      out.push(part);
    } else if (part.type === 'text') {
      textChunks.push(part.text);
    } else if (part.type === 'tool_use') {
      textChunks.push(`(unexpected tool_use in tool output: ${part.name})`);
    }
  }
  if (textChunks.length > 0) {
    out.unshift({ type: 'tool_result', toolCallId: callId, content: textChunks.join('\n') });
  }
  return out;
}
