import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Load a .env file into process.env.
 *
 * The App gets this from Probot, so only the CLI needed it — and until now
 * `forge run` on a machine configured entirely through .env would report no
 * provider and fail, which reads as a broken install rather than a missing
 * import. Hand-rolled to keep dotenv out of the dependency list for ~20 lines.
 *
 * Real environment variables always win: an explicit `KEY=… forge run` must
 * override the file, not the other way round.
 */
export function loadEnvFile(dir = process.cwd(), file = '.env'): number {
  let text: string;
  try {
    text = readFileSync(path.join(dir, file), 'utf8');
  } catch {
    return 0; // no .env is the normal case, not an error
  }

  let loaded = 0;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;

    const key = trimmed.slice(0, eq).replace(/^export\s+/, '').trim();
    if (!key || key in process.env) continue;

    let value = trimmed.slice(eq + 1).trim();
    // Quoted values may legitimately contain # and spaces; unquoted ones end at
    // the first comment marker.
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      value = value.split(' #')[0]!.trim();
    }
    process.env[key] = value;
    loaded++;
  }
  return loaded;
}
