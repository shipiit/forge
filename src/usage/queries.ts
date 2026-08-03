import type { DatabaseSync } from 'node:sqlite';

/**
 * Every question the dashboard asks, as SQL.
 *
 * Kept apart from the HTTP layer so each one can be tested against a real
 * database without a server, and so the shapes the UI renders are declared in
 * one place rather than assembled inline in a route.
 */

export interface Window {
  /** How far back to look. */
  days?: number;
  /**
   * Slide the whole window back by this many days.
   *
   * How the dashboard gets "18% more than the period before": the same query,
   * the same length of window, shifted. Comparing against half of a double-width
   * window would be a different question with a similar-looking answer.
   */
  shift?: number;
  owner?: string;
  repo?: string;
  flow?: string;
  status?: string;
  model?: string;
}

type Row = Record<string, unknown>;

const all = (db: DatabaseSync, sql: string, params: unknown[]): Row[] =>
  db.prepare(sql).all(...(params as never[])) as Row[];

const one = (db: DatabaseSync, sql: string, params: unknown[]): Row =>
  (db.prepare(sql).get(...(params as never[])) as Row) ?? {};

const num = (v: unknown): number => Number(v ?? 0);

/**
 * Build the shared WHERE clause.
 *
 * Every filter is a bound parameter. The column names are literals in this
 * file and never come from a request, which is what keeps the string
 * concatenation here safe.
 */
export function where(w: Window, now: number, prefix = 'runs.'): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const day = 86_400_000;
  const shift = (w.shift ?? 0) * day;
  if (w.days && w.days > 0) {
    clauses.push(`${prefix}started_at >= ?`);
    params.push(now - w.days * day - shift);
  }
  if (shift > 0) {
    clauses.push(`${prefix}started_at < ?`);
    params.push(now - shift);
  }
  for (const [col, val] of [
    ['owner', w.owner],
    ['repo', w.repo],
    ['flow', w.flow],
    ['status', w.status],
    ['model', w.model],
  ] as const) {
    if (val) {
      clauses.push(`${prefix}${col} = ?`);
      params.push(val);
    }
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

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

/** The headline numbers. One row, whatever the window. */
export function summary(db: DatabaseSync, w: Window, now = Date.now()): Summary {
  const { sql, params } = where(w, now);
  const r = one(
    db,
    `SELECT COUNT(*) runs,
            SUM(status='ok') ok,
            SUM(status='failed') failed,
            SUM(status='skipped') skipped,
            SUM(status='running') running,
            SUM(usd) usd, SUM(usd_uncached) usd_uncached,
            SUM(input_tokens) input_tokens, SUM(output_tokens) output_tokens,
            SUM(cache_read) cache_read, SUM(cache_write) cache_write,
            SUM(iterations) iterations
       FROM runs ${sql}`,
    params,
  );

  const scoped = `run_id IN (SELECT id FROM runs ${sql})`;
  const tools = one(db, `SELECT COUNT(*) n, SUM(ok=0) bad FROM tool_calls WHERE ${scoped}`, params);
  const findings = one(db, `SELECT COUNT(*) n FROM findings WHERE ${scoped}`, params);

  return {
    runs: num(r.runs),
    ok: num(r.ok),
    failed: num(r.failed),
    skipped: num(r.skipped),
    running: num(r.running),
    usd: num(r.usd),
    usdUncached: num(r.usd_uncached),
    // What caching saved, which is the number that justifies the feature.
    saved: Math.max(0, num(r.usd_uncached) - num(r.usd)),
    inputTokens: num(r.input_tokens),
    outputTokens: num(r.output_tokens),
    cacheRead: num(r.cache_read),
    cacheWrite: num(r.cache_write),
    iterations: num(r.iterations),
    toolCalls: num(tools.n),
    toolErrors: num(tools.bad),
    findings: num(findings.n),
    ...durations(db, w, now),
  };
}

/**
 * Median and p95 wall-clock, by offset rather than by loading every duration.
 *
 * The average is the wrong statistic here — one 40-minute audit drags it
 * somewhere no run actually was.
 */
export function durations(db: DatabaseSync, w: Window, now = Date.now()): { medianMs: number; p95Ms: number } {
  const { sql, params } = where(w, now);
  const finished = `${sql ? `${sql} AND` : 'WHERE'} ended_at IS NOT NULL`;
  const n = num(one(db, `SELECT COUNT(*) n FROM runs ${finished}`, params).n);
  if (n === 0) return { medianMs: 0, p95Ms: 0 };

  const at = (fraction: number): number => {
    const offset = Math.min(n - 1, Math.floor(n * fraction));
    const row = one(
      db,
      `SELECT ended_at - started_at d FROM runs ${finished} ORDER BY d LIMIT 1 OFFSET ?`,
      [...params, offset],
    );
    return Math.max(0, num(row.d));
  };
  return { medianMs: at(0.5), p95Ms: at(0.95) };
}

/** Cost and volume per day, oldest first — the shape a chart wants. */
export function daily(db: DatabaseSync, w: Window, now = Date.now()): Row[] {
  const { sql, params } = where({ days: 30, ...w }, now);
  return all(
    db,
    `SELECT date(started_at / 1000, 'unixepoch') day,
            COUNT(*) runs, SUM(usd) usd,
            SUM(input_tokens + output_tokens + cache_read) tokens,
            SUM(status='failed') failed
       FROM runs ${sql}
      GROUP BY day ORDER BY day`,
    params,
  );
}

/** Group runs by any one dimension: flow, model, repo, provider, skill. */
export function breakdown(db: DatabaseSync, column: string, w: Window, now = Date.now()): Row[] {
  const allowed = [
    'flow', 'model', 'provider', 'owner', 'repo', 'skill', 'routine',
    'surface', 'status', 'stopped_by', 'trigger', 'actor',
  ];
  if (!allowed.includes(column)) throw new Error(`not a groupable column: ${column}`);
  const { sql, params } = where(w, now);
  return all(
    db,
    `SELECT ${column} key, COUNT(*) runs, SUM(usd) usd,
            SUM(input_tokens + output_tokens + cache_read) tokens,
            SUM(status='failed') failed
       FROM runs ${sql}
      GROUP BY ${column} HAVING key IS NOT NULL ORDER BY usd DESC, runs DESC`,
    params,
  );
}

/**
 * Per-tool reliability. The p95 is the point: a tool that is usually instant
 * and occasionally takes 40 seconds is the one worth knowing about, and a mean
 * hides it completely.
 */
export function toolStats(db: DatabaseSync, w: Window, now = Date.now()): Row[] {
  const { sql, params } = where(w, now);
  const scoped = sql ? `WHERE run_id IN (SELECT id FROM runs ${sql})` : '';
  const names = all(
    db,
    `SELECT name, COUNT(*) calls, SUM(ok=0) errors, AVG(duration_ms) avg_ms,
            SUM(output_bytes) bytes
       FROM tool_calls ${scoped}
      GROUP BY name ORDER BY calls DESC`,
    params,
  );
  return names.map((t) => {
    const n = num(t.calls);
    const offset = Math.min(n - 1, Math.floor(n * 0.95));
    const p95 = one(
      db,
      `SELECT duration_ms d FROM tool_calls ${scoped ? `${scoped} AND` : 'WHERE'} name = ?
        ORDER BY duration_ms LIMIT 1 OFFSET ?`,
      [...params, t.name, Math.max(0, offset)],
    );
    return { ...t, p95_ms: num(p95.d) };
  });
}

/** Findings by severity and lens, so the security picture is one query. */
export function findingStats(db: DatabaseSync, w: Window, now = Date.now()): Row[] {
  const { sql, params } = where(w, now);
  const scoped = sql ? `WHERE run_id IN (SELECT id FROM runs ${sql})` : '';
  return all(
    db,
    `SELECT severity, lens, COUNT(*) n, SUM(pre_existing) pre_existing, SUM(posted_inline) posted
       FROM findings ${scoped} GROUP BY severity, lens`,
    params,
  );
}

/** A page of runs, newest first. Cursor is the last id seen. */
export function runs(db: DatabaseSync, w: Window & { limit?: number; before?: string; q?: string }, now = Date.now()): Row[] {
  const { sql, params } = where(w, now);
  const extra: string[] = [];
  if (w.before) {
    extra.push('id < ?');
    params.push(w.before);
  }
  if (w.q) {
    extra.push('(repo LIKE ? OR owner LIKE ? OR actor LIKE ? OR error LIKE ?)');
    const like = `%${w.q}%`;
    params.push(like, like, like, like);
  }
  const clause = extra.length ? `${sql ? `${sql} AND` : 'WHERE'} ${extra.join(' AND ')}` : sql;
  const limit = Math.min(200, Math.max(1, w.limit ?? 50));
  return all(db, `SELECT * FROM runs ${clause} ORDER BY id DESC LIMIT ${limit}`, params);
}

/** Everything about one run: the row, its turns, its tools, its findings. */
export function runDetail(db: DatabaseSync, id: string): Row | undefined {
  const run = one(db, `SELECT * FROM runs WHERE id = ?`, [id]);
  if (!run.id) return undefined;
  return {
    run,
    turns: all(db, `SELECT * FROM turns WHERE run_id = ? ORDER BY phase, idx`, [id]),
    tools: all(db, `SELECT * FROM tool_calls WHERE run_id = ? ORDER BY id`, [id]),
    findings: all(db, `SELECT * FROM findings WHERE run_id = ? ORDER BY severity`, [id]),
    artifacts: all(db, `SELECT id, kind, bytes, created_at FROM artifacts WHERE run_id = ?`, [id]),
  };
}

/** The values the filter dropdowns offer, taken from what actually exists. */
export function facets(db: DatabaseSync, now = Date.now()): Row {
  const distinct = (col: string) =>
    all(db, `SELECT DISTINCT ${col} v FROM runs WHERE ${col} IS NOT NULL ORDER BY v`, []).map((r) => r.v);
  return {
    flows: distinct('flow'),
    models: distinct('model'),
    repos: all(db, `SELECT DISTINCT owner || '/' || repo v FROM runs ORDER BY v`, []).map((r) => r.v),
    statuses: distinct('status'),
    now,
  };
}

/** An artifact's stored path, looked up by id — never taken from a request. */
export function artifactPath(db: DatabaseSync, id: string): { path: string; kind: string } | undefined {
  const row = one(db, `SELECT path, kind FROM artifacts WHERE id = ?`, [id]);
  return row.path ? { path: String(row.path), kind: String(row.kind) } : undefined;
}

/**
 * Average tool latency per day, per tool.
 *
 * `tool_calls` has no timestamp of its own — it is joined to its run, which is
 * both accurate enough for a trend line and one fewer column on the hottest
 * table in the schema.
 */
export function toolTrend(db: DatabaseSync, w: Window, now = Date.now()): Row[] {
  const { sql, params } = where(w, now, 'r.');
  return all(
    db,
    `SELECT t.name, date(r.started_at / 1000, 'unixepoch') day,
            AVG(t.duration_ms) avg_ms, COUNT(*) calls
       FROM tool_calls t JOIN runs r ON r.id = t.run_id ${sql}
      GROUP BY t.name, day ORDER BY day`,
    params,
  );
}

/** Findings by day and severity — the security trend, not just a total. */
export function findingTrend(db: DatabaseSync, w: Window, now = Date.now()): Row[] {
  const { sql, params } = where(w, now, 'r.');
  return all(
    db,
    `SELECT date(r.started_at / 1000, 'unixepoch') day, f.severity, COUNT(*) n
       FROM findings f JOIN runs r ON r.id = f.run_id ${sql}
      GROUP BY day, f.severity ORDER BY day`,
    params,
  );
}

/** Findings themselves, newest first, with the run they came from. */
export function findingsList(db: DatabaseSync, w: Window & { limit?: number; severity?: string }, now = Date.now()): Row[] {
  const { sql, params } = where(w, now, 'r.');
  const extra = w.severity ? `${sql ? `${sql} AND` : 'WHERE'} f.severity = ?` : sql;
  if (w.severity) params.push(w.severity);
  const limit = Math.min(500, Math.max(1, w.limit ?? 100));
  return all(
    db,
    `SELECT f.*, r.owner, r.repo, r.flow, r.started_at, r.result_url, r.pr_number, r.issue_number
       FROM findings f JOIN runs r ON r.id = f.run_id ${extra}
      ORDER BY r.started_at DESC LIMIT ${limit}`,
    params,
  );
}

/**
 * Every tool failure, with its run. The aggregate says a tool fails 27% of the
 * time; this says what it actually said when it did.
 */
export function toolErrors(db: DatabaseSync, w: Window & { limit?: number; name?: string }, now = Date.now()): Row[] {
  const { sql, params } = where(w, now, 'r.');
  const clauses = [sql ? sql.slice(6) : '', 't.ok = 0', w.name ? 't.name = ?' : ''].filter(Boolean);
  if (w.name) params.push(w.name);
  const limit = Math.min(300, Math.max(1, w.limit ?? 60));
  return all(
    db,
    `SELECT t.name, t.phase, t.turn_idx, t.duration_ms, t.error, t.args_preview,
            r.id run_id, r.owner, r.repo, r.flow, r.started_at
       FROM tool_calls t JOIN runs r ON r.id = t.run_id
      WHERE ${clauses.join(' AND ')}
      ORDER BY r.started_at DESC LIMIT ${limit}`,
    params,
  );
}
