import path from 'node:path';
import type { ContentPart, ToolSpec } from '../../providers/types.js';

/** Runtime context handed to every tool invocation. */
export interface ToolContext {
  /** Absolute path to the workspace root. All tool file access is confined here. */
  cwd: string;
  /** Whether the active model accepts images (gates `read_image`). */
  supportsVision: boolean;
}

/** A tool the agent can call. `run` returns content parts appended as a tool_result. */
export interface Tool {
  spec: ToolSpec;
  run(args: Record<string, unknown>, ctx: ToolContext): Promise<ContentPart[]>;
}

/** Convenience: wrap a string as a single text content part. */
export function textPart(text: string): ContentPart[] {
  return [{ type: 'text', text }];
}

/**
 * Resolve a user-supplied relative path against the workspace root and refuse any
 * path that escapes it (path traversal guard). Returns the absolute path.
 */
export function safeResolve(cwd: string, relPath: string): string {
  const root = path.resolve(cwd);
  const abs = path.resolve(root, relPath);
  const rel = path.relative(root, abs);
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new Error(`Path escapes the workspace: ${relPath}`);
  }
  return abs;
}
