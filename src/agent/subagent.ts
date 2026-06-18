import { z } from 'zod';
import type { LLMClient } from '../providers/types.js';
import { runAgent, type AgentLimits } from './loop.js';
import { editToolset } from './tools/registry.js';
import { type Tool, textPart } from './tools/types.js';

const SUBAGENT_SYSTEM =
  'You are a focused sub-agent working in a shared repository workspace. Complete the single ' +
  'delegated task below using the tools, verify your work, then reply with a concise summary of ' +
  'exactly what you changed. Do not work outside the scope of the task.';

export interface SubagentOptions {
  client: LLMClient;
  limits: AgentLimits;
  /** Current nesting depth (0 at the top). */
  depth: number;
  /** Maximum nesting depth allowed. */
  maxDepth: number;
  testCommand?: string;
}

/**
 * A `spawn_subagent` tool. The orchestrating agent calls it with a focused task;
 * a fresh agent loop runs over the SAME workspace (edits persist) and returns its
 * summary. Depth is bounded so delegation can't recurse forever — and the base
 * file/search/edit tools are always available so work still gets done at max depth.
 */
export function makeSubagentTool(opts: SubagentOptions): Tool {
  return {
    spec: {
      name: 'spawn_subagent',
      description:
        'Delegate a focused, self-contained subtask to a fresh sub-agent that shares this ' +
        'workspace (e.g. "implement module X", "write tests for Y"). Returns the sub-agent\'s ' +
        'summary. Use this to break a large task into independent pieces.',
      parameters: {
        type: 'object',
        properties: { task: { type: 'string', description: 'The focused subtask to delegate.' } },
        required: ['task'],
      },
    },
    async run(args, ctx) {
      const { task } = z.object({ task: z.string() }).parse(args);
      if (opts.depth >= opts.maxDepth) {
        return textPart('Max sub-agent depth reached — complete this subtask directly with your own tools.');
      }
      const result = await runAgent({
        client: opts.client,
        system: SUBAGENT_SYSTEM,
        initialContent: [{ type: 'text', text: task }],
        tools: orchestratorToolset({ ...opts, depth: opts.depth + 1 }),
        limits: opts.limits,
        cwd: ctx.cwd,
      });
      return textPart(`Sub-agent completed "${task}".\n\n${result.finalText}`);
    },
  };
}

/**
 * The edit toolset plus `spawn_subagent` (when more nesting is allowed). Use this
 * for large fix tasks so the agent can orchestrate sub-agents.
 */
export function orchestratorToolset(opts: SubagentOptions): Tool[] {
  const base = editToolset({ testCommand: opts.testCommand });
  if (opts.depth >= opts.maxDepth) return base;
  return [...base, makeSubagentTool(opts)];
}
