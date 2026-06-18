import type { ContentPart, LLMClient, Msg } from '../providers/types.js';
import { type Tool, type ToolContext } from './tools/types.js';
import { indexTools } from './tools/registry.js';
import { withRetry } from '../util/resilience.js';

export interface AgentLimits {
  maxIterations: number;
  maxOutputTokens: number;
}

export interface AgentResult {
  finalText: string;
  iterations: number;
  stoppedBy: 'end' | 'limit';
  messages: Msg[];
  usage: { inputTokens: number; outputTokens: number };
}

export interface RunAgentOptions {
  client: LLMClient;
  system: string;
  /** Initial user content (task text, issue body, extracted images, diff, …). */
  initialContent: ContentPart[];
  tools: Tool[];
  limits: AgentLimits;
  cwd: string;
  /** Optional callback for progress logging (tool calls, iterations). */
  onEvent?: (event: AgentEvent) => void;
}

export type AgentEvent =
  | { type: 'iteration'; n: number }
  | { type: 'tool'; name: string; args: Record<string, unknown> }
  | { type: 'tool_error'; name: string; message: string }
  | { type: 'assistant_text'; text: string };

/**
 * Drive the model/tool loop until the model finishes or limits are hit.
 *
 * Each turn: call the model; if it requests tools, run them, feed the results
 * back, and continue. The assistant's tool_use turn and the resulting
 * tool_result turn are both recorded so providers can round-trip correctly.
 */
export async function runAgent(opts: RunAgentOptions): Promise<AgentResult> {
  const { client, system, initialContent, tools, limits, cwd, onEvent } = opts;
  const byName = indexTools(tools);
  const toolSpecs = tools.map((t) => t.spec);
  const ctx: ToolContext = { cwd, supportsVision: client.supportsVision };

  const messages: Msg[] = [{ role: 'user', content: initialContent }];
  const usage = { inputTokens: 0, outputTokens: 0 };
  let finalText = '';
  let nudged = false; // ensure the model actually writes a final answer if it ends empty

  for (let n = 1; n <= limits.maxIterations; n++) {
    onEvent?.({ type: 'iteration', n });
    const res = await withRetry(() => client.chat({ system, messages, tools: toolSpecs, maxTokens: limits.maxOutputTokens }));
    usage.inputTokens += res.usage.inputTokens;
    usage.outputTokens += res.usage.outputTokens;

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
      try {
        const parts = await tool.run(call.args, ctx);
        resultParts.push(...normalizeToolResult(call.id, parts));
      } catch (err) {
        const message = (err as Error).message;
        onEvent?.({ type: 'tool_error', name: call.name, message });
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
