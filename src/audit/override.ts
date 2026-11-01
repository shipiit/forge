import type { OctokitLike } from '../github/pr.js';
import type { AuditSlice, SliceNeed } from './slices.js';

/**
 * Audit slices from another repository: `audit_skills: owner/repo@<commit>`.
 *
 * A full commit SHA, never a branch or tag. These prompts steer an agent that
 * reads the whole codebase; letting them move under a mutable ref would mean
 * whoever can push to that repository decides what every audit looks for.
 *
 * Reads the shipiit/pentest-skills layout (`deep-security-audit/references/
 * slices.md`, one `## N. Title` section per slice) or the same file at
 * `audit/slices.md`. Anything that fails returns undefined and the caller
 * keeps the built-in slices — a broken override is not a reason to skip an audit.
 */

export interface SkillsSpec {
  owner: string;
  repo: string;
  sha: string;
}

const NAME = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,99})$/;

export function parseSkillsSpec(raw: string): SkillsSpec | string {
  const m = /^([^/\s@]+)\/([^/\s@]+)@([0-9a-f]{40})$/i.exec(raw.trim());
  if (!m) return 'audit_skills must be owner/repo@<full 40-character commit SHA>';
  const [, owner, repo, sha] = m;
  if (!NAME.test(owner!) || !NAME.test(repo!) || repo === '.' || repo === '..') return 'audit_skills names an invalid repository';
  return { owner: owner!, repo: repo!, sha: sha!.toLowerCase() };
}

const PATHS = ['deep-security-audit/references/slices.md', 'audit/slices.md'];
const CHECKLISTS = 'deep-security-audit/references/checklists.md';
const MAX_SLICE_CHARS = 6000;
const MAX_CHECKLIST_CHARS = 8000;
const MAX_SLICES = 12;

/** Coverage rows and need, read off a slice's title. */
function classify(title: string): { rows: number[]; needs: SliceNeed } {
  const t = title.toLowerCase();
  if (/frontend|client|browser/.test(t)) return { rows: [14], needs: 'frontend' };
  if (/llm|agent|\bai\b/.test(t)) return { rows: [15], needs: 'llm' };
  if (/authori[sz]|access|endpoint|idor/.test(t)) return { rows: [4, 12], needs: 'always' };
  if (/authenti|identity|session|login/.test(t)) return { rows: [2, 3], needs: 'always' };
  if (/inject|ssrf|crypto|file/.test(t)) return { rows: [5, 6, 11], needs: 'always' };
  if (/money|business|logic/.test(t)) return { rows: [10], needs: 'always' };
  if (/pii|privacy|personal|logging|retention|encryption/.test(t)) return { rows: [7, 8], needs: 'always' };
  if (/docker|ci|supply|config|infra|settings/.test(t)) return { rows: [1, 13], needs: 'always' };
  return { rows: [], needs: 'always' };
}

function slug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'slice';
}

/** Split a slices file into slices. Scanner triage is skipped: the verifier does that job here. */
export function parseSlicesMarkdown(text: string, checklist = ''): AuditSlice[] {
  const sections = text.split(/^## +/m).slice(1);
  const out: AuditSlice[] = [];
  const ids = new Set<string>();
  for (const section of sections) {
    const newline = section.indexOf('\n');
    const heading = (newline < 0 ? section : section.slice(0, newline)).trim();
    const title = heading.replace(/^[\d\s.–-]+/, '').trim();
    const body = newline < 0 ? '' : section.slice(newline + 1).trim();
    if (!title || !body || /scanner triage/i.test(title)) continue;
    let id = slug(title);
    while (ids.has(id)) id = `${id}-x`;
    ids.add(id);
    const extra = checklist ? `\n\nReference checklist (questions to answer with file:line):\n${checklist}` : '';
    out.push({ id, title, ...classify(title), prompt: (body.slice(0, MAX_SLICE_CHARS) + extra).trim() });
    if (out.length >= MAX_SLICES) break;
  }
  return out;
}

async function fetchText(octokit: OctokitLike, spec: SkillsSpec, path: string): Promise<string | undefined> {
  try {
    const res = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
      owner: spec.owner,
      repo: spec.repo,
      path,
      ref: spec.sha,
      headers: { accept: 'application/vnd.github.raw' },
    });
    const data: unknown = res.data;
    if (typeof data === 'string') return data;
    const content = typeof data === 'object' && data !== null ? Reflect.get(data, 'content') : undefined;
    return typeof content === 'string' ? Buffer.from(content, 'base64').toString('utf8') : undefined;
  } catch {
    return undefined;
  }
}

export async function loadAuditSlices(
  octokit: OctokitLike,
  raw: string,
  log: (msg: string) => void,
): Promise<AuditSlice[] | undefined> {
  const spec = parseSkillsSpec(raw);
  if (typeof spec === 'string') {
    log(`audit: ${spec}; using the built-in slices`);
    return undefined;
  }
  for (const path of PATHS) {
    const text = await fetchText(octokit, spec, path);
    if (!text) continue;
    const checklist = path.startsWith('deep-security-audit/') ? ((await fetchText(octokit, spec, CHECKLISTS)) ?? '').slice(0, MAX_CHECKLIST_CHARS) : '';
    const slices = parseSlicesMarkdown(text, checklist);
    if (slices.length) {
      log(`audit: ${slices.length} slices from ${spec.owner}/${spec.repo}@${spec.sha.slice(0, 7)}:${path}`);
      return slices;
    }
  }
  log(`audit: no slices readable at ${spec.owner}/${spec.repo}@${spec.sha.slice(0, 7)} (is the token allowed to read it?); using the built-in slices`);
  return undefined;
}
