import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { ContentPart } from '../../providers/types.js';
import { type Tool, type ToolContext, safeResolve, textPart } from './types.js';

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

export const readFile: Tool = {
  spec: {
    name: 'read_file',
    description: 'Read a UTF-8 text file from the workspace. Returns its full contents.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Path relative to the workspace root.' } },
      required: ['path'],
    },
  },
  async run(args, ctx): Promise<ContentPart[]> {
    const { path: rel } = parse(z.object({ path: z.string() }), args);
    const abs = safeResolve(ctx.cwd, rel);
    const body = await fs.readFile(abs, 'utf8');
    return textPart(body);
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
    return textPart(`Wrote ${content.length} bytes to ${rel}.`);
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
    await fs.writeFile(abs, body.replace(old_string, new_string), 'utf8');
    return textPart(`Edited ${rel}.`);
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
