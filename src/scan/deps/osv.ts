import type { ReviewFinding } from '../../github/review.js';
import type { Dep, Ecosystem } from './lockfiles.js';

/**
 * OSV.dev: one database covering GitHub advisories, PyPA, RustSec and the
 * OpenSSF malicious-packages feed. The last one is the reason to ask OSV rather
 * than rely on Dependabot — a hijacked release is published as a `MAL-` entry
 * within hours, and nothing about it shows up as a CVE.
 */

export type FetchLike = (url: string, init: { method: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export interface Advisory {
  id: string;
  aliases: string[];
  summary: string;
  severity: ReviewFinding['severity'];
  /** Versions that fix it, for this package. */
  fixed: string[];
  cwes: string[];
  malicious: boolean;
}

export interface OsvOptions {
  fetch?: FetchLike;
  endpoint?: string;
  timeoutMs?: number;
  /** Upper bound on advisories fetched in detail, so one ancient lockfile cannot become a thousand requests. */
  maxDetails?: number;
}

export type OsvResult = { ok: true; advisories: Map<string, Advisory[]> } | { ok: false; reason: string };

const BATCH = 1000;
const PARALLEL = 8;

export function depKey(d: Pick<Dep, 'ecosystem' | 'name' | 'version'>): string {
  return `${d.ecosystem}|${d.name}|${d.version}`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/**
 * Advisory text comes from a public database anyone can contribute to, and it
 * ends up in a PR comment and in the model's prompt. One line, no markup.
 */
export function plain(s: unknown, max = 200): string {
  const flat = String(s ?? '')
    .replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, ' ')
    .replace(/[`<>[\]|*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

const GHSA_SEVERITY: Record<string, ReviewFinding['severity']> = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MODERATE: 'medium',
  MEDIUM: 'medium',
  LOW: 'low',
};

function normalise(ecosystem: Ecosystem, name: string): string {
  return ecosystem === 'PyPI' ? name.toLowerCase().replace(/[-_.]+/g, '-') : name;
}

/** Reduce one OSV vulnerability record to what a finding needs. */
export function toAdvisory(raw: unknown, dep: Pick<Dep, 'ecosystem' | 'name'>): Advisory | undefined {
  if (!isRecord(raw) || typeof raw.id !== 'string') return undefined;
  const id = raw.id;
  const malicious = id.startsWith('MAL-');
  const db = isRecord(raw.database_specific) ? raw.database_specific : {};
  const rated = typeof db.severity === 'string' ? GHSA_SEVERITY[db.severity.toUpperCase()] : undefined;
  const fixed = new Set<string>();
  for (const a of Array.isArray(raw.affected) ? raw.affected : []) {
    if (!isRecord(a) || !isRecord(a.package)) continue;
    if (a.package.ecosystem !== dep.ecosystem) continue;
    if (normalise(dep.ecosystem, String(a.package.name)) !== normalise(dep.ecosystem, dep.name)) continue;
    for (const r of Array.isArray(a.ranges) ? a.ranges : []) {
      if (!isRecord(r)) continue;
      for (const e of Array.isArray(r.events) ? r.events : []) {
        if (isRecord(e) && typeof e.fixed === 'string') fixed.add(e.fixed);
      }
    }
  }
  return {
    id,
    aliases: strings(raw.aliases),
    summary: plain(raw.summary ?? raw.details ?? ''),
    // An unrated advisory is still an advisory. Medium says "look at this"
    // without blocking a merge on a rating nobody has assigned yet.
    severity: malicious ? 'critical' : (rated ?? 'medium'),
    fixed: [...fixed].slice(0, 3),
    cwes: strings(db.cwe_ids),
    malicious,
  };
}

async function call(f: FetchLike, url: string, timeoutMs: number, body?: unknown): Promise<unknown> {
  const res = await f(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`OSV returned ${res.status}`);
  return res.json();
}

/** Run `fn` over `items`, at most `n` at a time. */
async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]!);
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}

/**
 * Advisories for each dependency, keyed by `depKey`.
 *
 * Never throws. An unreachable OSV is reported as such, so the caller can say
 * the check did not run — which is different from saying nothing was found.
 */
export async function lookupAdvisories(deps: Dep[], opts: OsvOptions = {}): Promise<OsvResult> {
  const f: FetchLike = opts.fetch ?? fetch;
  const endpoint = opts.endpoint ?? 'https://api.osv.dev';
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const maxDetails = opts.maxDetails ?? 100;

  const unique = [...new Map(deps.map((d) => [depKey(d), d])).values()];
  const idsFor = new Map<string, string[]>();
  try {
    for (let i = 0; i < unique.length; i += BATCH) {
      const chunk = unique.slice(i, i + BATCH);
      const res = await call(f, `${endpoint}/v1/querybatch`, timeoutMs, {
        queries: chunk.map((d) => ({ package: { name: d.name, ecosystem: d.ecosystem }, version: d.version })),
      });
      const results = isRecord(res) && Array.isArray(res.results) ? res.results : undefined;
      if (!results || results.length !== chunk.length) throw new Error('OSV returned a malformed batch response');
      results.forEach((r, j) => {
        const ids = isRecord(r) && Array.isArray(r.vulns) ? r.vulns.map((v) => (isRecord(v) ? v.id : undefined)) : [];
        const valid = ids.filter((id): id is string => typeof id === 'string');
        if (valid.length) idsFor.set(depKey(chunk[j]!), valid);
      });
    }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'OSV request failed' };
  }

  // Malicious-package entries first, so the cap never drops the one that matters most.
  const allIds = [...new Set([...idsFor.values()].flat())].sort((a, b) => Number(b.startsWith('MAL-')) - Number(a.startsWith('MAL-')));
  const details = new Map<string, unknown>();
  await pool(allIds.slice(0, maxDetails), PARALLEL, async (id) => {
    try {
      details.set(id, await call(f, `${endpoint}/v1/vulns/${encodeURIComponent(id)}`, timeoutMs));
    } catch {
      // The id alone is still worth reporting; it is filled in below.
    }
  });

  const advisories = new Map<string, Advisory[]>();
  for (const d of unique) {
    const ids = idsFor.get(depKey(d));
    if (!ids) continue;
    const list = ids.map(
      (id): Advisory =>
        toAdvisory(details.get(id), d) ?? {
          id,
          aliases: [],
          summary: '',
          severity: id.startsWith('MAL-') ? 'critical' : 'medium',
          fixed: [],
          cwes: [],
          malicious: id.startsWith('MAL-'),
        },
    );
    advisories.set(depKey(d), list);
  }
  return { ok: true, advisories };
}
