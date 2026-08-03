import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The dashboard's data layer.
 *
 * The agent serves the API; this site is static and can be deployed anywhere,
 * so where that API lives is something the viewer configures once and we keep.
 * In dev it defaults to the Vite proxy, which forwards to `forge dashboard`.
 */

const API_KEY = 'forge.usage.api';
const TOKEN_KEY = 'forge.usage.token';

export const DEV_PROXY = '/usage-api';

const read = (key: string): string => {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return ''; // private mode
  }
};

export function apiBase(): string {
  return read(API_KEY) || (import.meta.env.DEV ? DEV_PROXY : '');
}
export function apiToken(): string {
  return read(TOKEN_KEY);
}
export function saveConnection(base: string, token: string): void {
  try {
    localStorage.setItem(API_KEY, base.replace(/\/+$/, ''));
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* private mode: the session still works, it just will not be remembered */
  }
}

export interface Filters {
  days: number;
  repo: string;
  flow: string;
  skill: string;
  status: string;
  q: string;
}

export const DEFAULT_FILTERS: Filters = { days: 30, repo: '', flow: '', skill: '', status: '', q: '' };

export interface Summary {
  runs: number;
  ok: number;
  failed: number;
  skipped: number;
  running: number;
  usd: number;
  usdUncached: number;
  saved: number;
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheWrite: number;
  iterations: number;
  toolCalls: number;
  toolErrors: number;
  findings: number;
  medianMs: number;
  p95Ms: number;
}

export interface DayRow {
  day: string;
  runs: number;
  usd: number;
  tokens: number;
  failed: number;
}
export interface GroupRow {
  key: string;
  runs: number;
  usd: number;
  tokens: number;
  failed: number;
}
export interface ToolRow {
  name: string;
  calls: number;
  errors: number;
  avg_ms: number;
  p95_ms: number;
  bytes: number;
}
export interface RunRow {
  id: string;
  started_at: number;
  ended_at: number | null;
  status: string;
  owner: string;
  repo: string;
  flow: string;
  trigger: string;
  model: string;
  provider: string;
  actor: string | null;
  skill: string | null;
  routine: string | null;
  issue_number: number | null;
  pr_number: number | null;
  iterations: number;
  stopped_by: string | null;
  error: string | null;
  result_url: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_read: number;
  cache_write: number;
  usd: number;
  usd_uncached: number;
}
export interface TurnRow {
  phase: string;
  idx: number;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  cache_read: number;
  cache_write: number;
  stop_reason: string;
}
export interface ToolCallRow {
  phase: string;
  turn_idx: number;
  name: string;
  duration_ms: number;
  ok: number;
  error: string | null;
  output_bytes: number | null;
  args_preview: string | null;
}
export interface FindingRow {
  file: string;
  line: number | null;
  lens: string;
  severity: string;
  category: string | null;
  title: string;
  pre_existing: number;
  posted_inline: number;
}
export interface RunDetail {
  run: RunRow;
  turns: TurnRow[];
  tools: ToolCallRow[];
  findings: FindingRow[];
  artifacts: Array<{ id: string; kind: string; bytes: number; created_at: number }>;
  outputs: Array<{ kind: string; ref: string | null; url: string | null; title: string | null; created_at: number }>;
}
export interface Facets {
  flows: string[];
  skills: string[];
  models: string[];
  repos: string[];
  statuses: string[];
}

/** Thrown so the page can tell "wrong token" apart from "server is down". */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function usageUrl(path: string, params: Record<string, string | number | undefined> = {}): string {
  const base = apiBase();
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '' && v !== null) qs.set(k, String(v));
  }
  return `${base}/${path}${qs.toString() ? `?${qs}` : ''}`;
}

/**
 * A URL for a link, not a fetch.
 *
 * Browser navigation sends no Authorization header, so an `<a href>` to the API
 * has to carry the token in the query string — which `authorized()` accepts for
 * exactly this reason. Never use this for a fetch: those send the header, and a
 * token in a URL lands in server logs and browser history.
 */
export function usageHref(path: string): string {
  const token = apiToken();
  return usageUrl(path, token ? { token } : {});
}

export async function fetchUsage<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
  signal?: AbortSignal,
): Promise<T> {
  const token = apiToken();
  const res = await fetch(usageUrl(path, params), {
    ...(signal ? { signal } : {}),
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (res.status === 401) throw new ApiError('This dashboard needs a valid access token.', 401);
  if (!res.ok) throw new ApiError(`The API returned ${res.status}.`, res.status);
  return (await res.json()) as T;
}

/** Turn the filter set into query parameters, once, for every call. */
export function filterParams(f: Filters): Record<string, string | number | undefined> {
  return {
    days: f.days,
    repo: f.repo || undefined,
    flow: f.flow || undefined,
    skill: f.skill || undefined,
    status: f.status || undefined,
    q: f.q || undefined,
  };
}

/**
 * Load one endpoint, cancelling whatever was already in the air.
 *
 * Without the abort, a slow response from an older filter lands after a newer
 * one and the screen quietly shows the wrong window.
 */
export function useUsage<T>(
  path: string,
  params: Record<string, string | number | undefined>,
  deps: unknown[],
): { data: T | undefined; error: ApiError | undefined; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<ApiError>();
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const abort = useRef<AbortController>();
  const paramRef = useRef(params);
  paramRef.current = params;

  useEffect(() => {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setLoading(true);
    fetchUsage<T>(path, paramRef.current, ctrl.signal)
      .then((d) => {
        setData(d);
        setError(undefined);
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof ApiError ? e : new ApiError('Could not reach the usage API.', 0));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, nonce, ...deps]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, loading, reload };
}
