import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { ContentPart } from '../../providers/types.js';
import { type Tool, type ToolContext, safeResolve, textPart, withSecurityNotes } from './types.js';

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

function parse<T>(schema: z.ZodType<T>, args: unknown): T {
  const result = schema.safeParse(args);
  if (!result.success) {
    throw new Error(`Invalid arguments: ${result.error.issues.map((i) => i.message).join('; ')}`);
  }
  return result.data;
}

/**
 * Cap on a single file read. An unbounded read of a generated bundle or lockfile
 * can be hundreds of thousands of tokens — and it is resent on every subsequent
 * turn. Reading a window keeps the agent effective without that tail risk.
 */
export const MAX_READ_CHARS = 60_000;

export const readFile: Tool = {
  spec: {
    name: 'read_file',
    description:
      'Read a UTF-8 text file from the workspace. Large files are returned in a window — ' +
      'pass offset/limit (1-based line numbers) to page through the rest.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to the workspace root.' },
        offset: { type: 'number', description: 'First line to return (1-based). Optional.' },
        limit: { type: 'number', description: 'Number of lines to return. Optional.' },
      },
      required: ['path'],
    },
  },
  async run(args, ctx): Promise<ContentPart[]> {
    const { path: rel, offset, limit } = parse(
      z.object({
        path: z.string(),
        offset: z.number().int().positive().optional(),
        limit: z.number().int().positive().optional(),
      }),
      args,
    );
    const abs = safeResolve(ctx.cwd, rel);
    const body = await fs.readFile(abs, 'utf8');

    if (offset === undefined && limit === undefined && body.length <= MAX_READ_CHARS) {
      return textPart(body);
    }

    const lines = body.split('\n');
    const start = (offset ?? 1) - 1;
    const end = limit === undefined ? lines.length : start + limit;
    let slice = lines.slice(Math.max(0, start), end).join('\n');

    let note = '';
    if (slice.length > MAX_READ_CHARS) {
      slice = slice.slice(0, MAX_READ_CHARS);
      note = `\n… [truncated at ${MAX_READ_CHARS} characters]`;
    }
    if (end < lines.length || start > 0) {
      note += `\n… [showing lines ${Math.max(1, start + 1)}-${Math.min(end, lines.length)} of ${lines.length}; pass offset/limit for more]`;
    }
    return textPart(slice + note);
  },
};

export const writeFile: Tool = {
  spec: {
    name: 'write_file',
    description: 'Create or overwrite a text file in the workspace with the given content.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to the workspace root.' },
        content: { type: 'string', description: 'Full file content to write.' },
      },
      required: ['path', 'content'],
    },
  },
  async run(args, ctx): Promise<ContentPart[]> {
    const { path: rel, content } = parse(z.object({ path: z.string(), content: z.string() }), args);
    const abs = safeResolve(ctx.cwd, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, 'utf8');
    return textPart(withSecurityNotes(ctx, rel, content, `Wrote ${content.length} bytes to ${rel}.`));
  },
};

export const editFile: Tool = {
  spec: {
    name: 'edit_file',
    description:
      'Replace an exact, unique string in a file with new text. Fails if the old string ' +
      'is missing or appears more than once (so edits are unambiguous).',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to the workspace root.' },
        old_string: { type: 'string', description: 'Exact text to replace; must be unique.' },
        new_string: { type: 'string', description: 'Replacement text.' },
      },
      required: ['path', 'old_string', 'new_string'],
    },
  },
  async run(args, ctx): Promise<ContentPart[]> {
    const { path: rel, old_string, new_string } = parse(
      z.object({ path: z.string(), old_string: z.string(), new_string: z.string() }),
      args,
    );
    const abs = safeResolve(ctx.cwd, rel);
    const body = await fs.readFile(abs, 'utf8');
    const first = body.indexOf(old_string);
    if (first === -1) throw new Error(`old_string not found in ${rel}.`);
    if (body.indexOf(old_string, first + 1) !== -1) {
      throw new Error(`old_string is not unique in ${rel}; include more surrounding context.`);
    }
    const updated = body.replace(old_string, new_string);
    await fs.writeFile(abs, updated, 'utf8');
    // Scan only the inserted text: warning about pre-existing patterns elsewhere
    // in a large file would be noise the agent can't act on.
    return textPart(withSecurityNotes(ctx, rel, new_string, `Edited ${rel}.`));
  },
};

export const listDir: Tool = {
  spec: {
    name: 'list_dir',
    description: 'List the entries of a directory in the workspace. Directories end with "/".',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Directory path; defaults to ".".' } },
    },
  },
  async run(args, ctx): Promise<ContentPart[]> {
    const { path: rel } = parse(z.object({ path: z.string().optional() }), args ?? {});
    const abs = safeResolve(ctx.cwd, rel ?? '.');
    const entries = await fs.readdir(abs, { withFileTypes: true });
    const lines = entries
      .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
      .sort();
    return textPart(lines.join('\n') || '(empty)');
  },
};

export const readImage: Tool = {
  spec: {
    name: 'read_image',
    description:
      'Read an image file (png/jpeg/gif/webp) from the workspace as visual input. ' +
      'Only usable when the active model supports vision.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Image path relative to the workspace.' } },
      required: ['path'],
    },
  },
  async run(args, ctx): Promise<ContentPart[]> {
    const { path: rel } = parse(z.object({ path: z.string() }), args);
    if (!ctx.supportsVision) {
      throw new Error('The active model does not support images; cannot read_image.');
    }
    const ext = path.extname(rel).toLowerCase();
    const mime = MIME_BY_EXT[ext];
    if (!mime) throw new Error(`Unsupported image type: ${ext || '(none)'}.`);
    const abs = safeResolve(ctx.cwd, rel);
    const buf = await fs.readFile(abs);
    return [{ type: 'image', mime, dataB64: buf.toString('base64') }];
  },
};
