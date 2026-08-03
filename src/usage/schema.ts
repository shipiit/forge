/**
 * The usage schema.
 *
 * Metadata lives here; payloads do not. A transcript is 200 KB of repetitive
 * JSON and there can be one per run — putting that in a column bloats the file,
 * slows every query that does not need it, and makes VACUUM painful. Artifacts
 * are written to disk gzipped and referenced by path, which costs ~60 bytes.
 *
 * The practical consequence: ~20 KB of metadata per run, so a thousand runs a
 * month is ~20 MB a year. SQLite does not notice that.
 */

/** Applied on every open. Connection state, not schema. */
export const PRAGMAS = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;
`;

/**
 * Ordered migrations. Index + 1 is the `user_version` a database is at after
 * running it, so an existing file only runs what it has not seen.
 *
 * `CREATE TABLE IF NOT EXISTS` cannot add a column to a table that already
 * exists, so a schema change is a new entry here, never an edit to an old one.
 */
export const MIGRATIONS: string[] = [
  // 1 — initial
  `
CREATE TABLE IF NOT EXISTS runs (
  id              TEXT PRIMARY KEY,
  started_at      INTEGER NOT NULL,
  ended_at        INTEGER,
  status          TEXT NOT NULL,

  host            TEXT NOT NULL,
  owner           TEXT NOT NULL,
  repo            TEXT NOT NULL,
  surface         TEXT NOT NULL,

  flow            TEXT NOT NULL,
  trigger         TEXT NOT NULL,
  skill           TEXT,
  routine         TEXT,
  issue_number    INTEGER,
  pr_number       INTEGER,
  actor           TEXT,

  provider        TEXT NOT NULL,
  model           TEXT NOT NULL,
  fell_back_to    TEXT,

  iterations      INTEGER NOT NULL DEFAULT 0,
  stopped_by      TEXT,
  error           TEXT,
  result_url      TEXT,

  input_tokens    INTEGER NOT NULL DEFAULT 0,
  output_tokens   INTEGER NOT NULL DEFAULT 0,
  cache_read      INTEGER NOT NULL DEFAULT 0,
  cache_write     INTEGER NOT NULL DEFAULT 0,
  usd             REAL    NOT NULL DEFAULT 0,
  usd_uncached    REAL    NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS runs_time   ON runs (started_at DESC);
CREATE INDEX IF NOT EXISTS runs_repo   ON runs (owner, repo, started_at DESC);
CREATE INDEX IF NOT EXISTS runs_flow   ON runs (flow, started_at DESC);

CREATE TABLE IF NOT EXISTS turns (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  phase           TEXT NOT NULL DEFAULT 'main',
  idx             INTEGER NOT NULL,
  started_at      INTEGER NOT NULL,
  latency_ms      INTEGER,
  input_tokens    INTEGER NOT NULL DEFAULT 0,
  output_tokens   INTEGER NOT NULL DEFAULT 0,
  cache_read      INTEGER NOT NULL DEFAULT 0,
  cache_write     INTEGER NOT NULL DEFAULT 0,
  stop_reason     TEXT,
  reasoning_chars INTEGER,
  retries         INTEGER NOT NULL DEFAULT 0,
  -- A run has several agent segments (the fix, then the self-review, then any
  -- sub-agents). Each numbers its turns from 1, so the phase is part of what
  -- makes a turn unique — without it the self-review overwrites the fix.
  UNIQUE (run_id, phase, idx)
);
CREATE INDEX IF NOT EXISTS turns_run ON turns (run_id, idx);

CREATE TABLE IF NOT EXISTS tool_calls (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  phase           TEXT NOT NULL DEFAULT 'main',
  turn_idx        INTEGER NOT NULL,
  name            TEXT NOT NULL,
  args_preview    TEXT,
  duration_ms     INTEGER,
  ok              INTEGER NOT NULL,
  error           TEXT,
  output_bytes    INTEGER
);
CREATE INDEX IF NOT EXISTS tool_run  ON tool_calls (run_id);
CREATE INDEX IF NOT EXISTS tool_name ON tool_calls (name, ok);

CREATE TABLE IF NOT EXISTS artifacts (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,
  path            TEXT NOT NULL,
  bytes           INTEGER NOT NULL,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS artifacts_run  ON artifacts (run_id);
CREATE INDEX IF NOT EXISTS artifacts_time ON artifacts (created_at);

CREATE TABLE IF NOT EXISTS findings (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  file            TEXT NOT NULL,
  line            INTEGER,
  lens            TEXT NOT NULL,
  severity        TEXT NOT NULL,
  category        TEXT,
  title           TEXT NOT NULL,
  pre_existing    INTEGER NOT NULL DEFAULT 0,
  posted_inline   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS findings_run ON findings (run_id);
CREATE INDEX IF NOT EXISTS findings_sev ON findings (severity, lens);
`,
];

/** The schema version this build expects. */
export const SCHEMA_VERSION = MIGRATIONS.length;

/**
 * Retention, in days. Zero means keep forever.
 *
 * Shipped with the feature rather than added later — retention bolted on
 * afterwards means a first cleanup that deletes months at once.
 */
export const RETENTION_DAYS = {
  /** Only useful while debugging a specific run. */
  transcript: 14,
  /** The agent's own closing summary; small, and the run list shows it. */
  final_text: 90,
  diff: 90,
  findings_artifact: 90,
  /** The bulk of the rows. */
  tool_calls: 90,
  /** Runs, turns, and findings are tiny and are the trend data. */
  runs: 0,
};
