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

/**
 * Where the API is.
 *
 * When the agent serves this page itself, the API is right here — same origin,
 * same path prefix — so there is nothing to configure and nothing to get
 * wrong. A saved setting still wins, because somebody pointing a local page at
 * a remote agent means it.
 */
export function apiBase(): string {
  const saved = read(API_KEY);
  if (saved) return saved;
  if (import.meta.env.DEV) return DEV_PROXY;
  // The agent stamps its real mount path into the shell it serves. Reading
  // import.meta.env.BASE_URL instead would return the build-time placeholder,
  // and every request would go to a path that does not exist.
  const stamped = (window as unknown as { __FORGE_BASE__?: string }).__FORGE_BASE__;
  if (stamped && !stamped.includes('__FORGE_BASE__')) return stamped.replace(/\/+$/, '');
  const base = import.meta.env.BASE_URL || '/';
  return base === '/' || base.includes('__FORGE_BASE__') ? '' : base.replace(/\/+$/, '');
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

const USER_KEY = 'forge.usage.user';

/**
 * A file the agent serves beside the bundle — the logo, say.
 *
 * Same stamped mount path the API uses, because they are served by the same
 * process from the same place.
 */
export function assetUrl(file: string): string {
  const stamped = (window as unknown as { __FORGE_BASE__?: string }).__FORGE_BASE__;
  const base = stamped && !stamped.includes('__FORGE_BASE__') ? stamped.replace(/\/+$/, '') : '';
  return `${base}/${file.replace(/^\/+/, '')}`;
}

export function signedInAs(): string {
  return read(USER_KEY);
}

/**
 * Is this browser signed in, and does this deployment use accounts?
 *
 * One call, before anything else loads: it decides whether to show the
 * dashboard or the front door. `signedIn` covers the shared token too — a
 * script's credential is not a person, but it does grant a look.
 */
export async function authState(base = apiBase()): Promise<{ accounts: boolean; signedIn: boolean }> {
  const token = apiToken();
  const [auth, me] = await Promise.all([
    fetch(`${base}/api/auth`).then(
      (r) => (r.ok ? (r.json() as Promise<{ accounts?: boolean }>) : { accounts: false }),
      () => ({ accounts: false }),
    ),
    token
      ? fetch(`${base}/api/me`, { headers: { authorization: `Bearer ${token}` } }).then(
          (r) => r.ok,
          () => false,
        )
      : Promise.resolve(false),
  ]);
  return { accounts: Boolean(auth.accounts), signedIn: me };
}

/** Whether this deployment has accounts, so a form is worth showing. */
export async function hasAccounts(base = apiBase()): Promise<boolean> {
  try {
    const res = await fetch(`${base}/api/auth`);
    if (!res.ok) return false;
    return Boolean(((await res.json()) as { accounts?: boolean }).accounts);
  } catch {
    return false; // unreachable API: the connection panel is the right answer
  }
}

/**
 * Sign in with a username and password, and keep the session it returns.
 *
 * The password is sent once and never stored: what is kept is the session
 * token the server issues, which can be revoked on its own and expires by
 * itself. Storing the password to "stay signed in" would be storing the one
 * secret that unlocks everything else the person owns.
 */
export async function signIn(base: string, username: string, password: string): Promise<void> {
  const res = await fetch(`${base.replace(/\/+$/, '')}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const body = (await res.json().catch(() => ({}))) as { token?: string; username?: string; error?: string };
  if (!res.ok || !body.token) {
    throw new ApiError(body.error || 'Could not sign in.', res.status);
  }
  saveConnection(base, body.token);
  try {
    localStorage.setItem(USER_KEY, body.username ?? username);
  } catch {
    /* private mode */
  }
}

/** Sign out here and on the server, so the token stops working for anyone. */
export async function signOut(): Promise<void> {
  const base = apiBase();
  const token = apiToken();
  if (base && token) {
    await fetch(`${base}/api/logout`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    }).catch(() => {
      /* the local half still matters even if the server is unreachable */
    });
  }
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    /* private mode */
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
