import path from 'node:path';
import { SQLiteRecorder } from './sqlite.js';
import { noopRecorder, type Recorder } from './types.js';

export { noopRecorder, type Recorder, type RunMeta, type Flow } from './types.js';
export { tracked, type RunTracker } from './track.js';
export { SQLiteRecorder } from './sqlite.js';

/** Where the database lives when recording is on but no path was given. */
export const DEFAULT_DB = '.forge/usage.db';

let shared: Recorder | undefined;

/**
 * The recorder this process should use.
 *
 * Opt-in: recording writes to disk and keeps repository names, actor logins and
 * error strings, which is not something to switch on for somebody without
 * asking. Set `FORGE_USAGE_DB` (a path) or `FORGE_USAGE=1` for the default one.
 *
 * The connection is shared across every handler in the process — SQLite is
 * happiest with one writer, and a per-run connection would fight the WAL lock.
 */
export function createRecorder(env: NodeJS.ProcessEnv = process.env): Recorder {
  if (shared) return shared;

  const file = env.FORGE_USAGE_DB?.trim() || (env.FORGE_USAGE === '1' ? DEFAULT_DB : '');
  if (!file) return (shared = noopRecorder);

  try {
    shared = new SQLiteRecorder({ file: path.resolve(file) });
  } catch {
    // A read-only filesystem or a Node without node:sqlite is a reason to lose
    // telemetry, not a reason for the process to fail to start.
    shared = noopRecorder;
  }
  return shared;
}

/** Drop the cached recorder. Tests only. */
export function resetRecorder(): void {
  shared = undefined;
}
