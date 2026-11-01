import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SQLiteRecorder, migrate } from '../../src/usage/sqlite.js';
import { findingRecords } from '../../src/usage/record.js';
import { findingDetail, findingsList } from '../../src/usage/queries.js';
import { MIGRATIONS } from '../../src/usage/schema.js';
import type { ReviewFinding } from '../../src/github/review.js';

const T0 = 1_754_000_000_000;
let dir: string;
let rec: SQLiteRecorder;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-detail-'));
  rec = new SQLiteRecorder({ file: path.join(dir, 'usage.db'), now: () => T0 });
});
afterEach(async () => {
  await rec.close();
  await fs.rm(dir, { recursive: true, force: true });
});

const finding = (over: Partial<ReviewFinding> = {}): ReviewFinding => ({
  file: 'src/a.ts', startLine: 9, endLine: 10, lens: 'security', severity: 'high', category: 'CWE-918',
  title: 'SSRF', body: 'req.body.url reaches fetch()', ...over,
});

async function seed(n: number, over: Partial<ReviewFinding> = {}) {
  const run = await rec.startRun({ host: 'github.com', owner: 'o', repo: 'r', surface: 'app', flow: 'review', trigger: 't', provider: 'p', model: 'm', startedAt: T0 });
  await rec.recordFindings(run, findingRecords(Array.from({ length: n }, (_, i) => finding({ title: `F${i}`, ...over }))));
  return run;
}

describe('finding details', () => {
  it('stores the explanation and fix, with secrets redacted', async () => {
    const key = `ghp_${'A1b2C3d4'.repeat(5)}`;
    await seed(1, { body: `Leaked ${key} in config`, suggestion: 'const url = allowlisted(req.body.url);' });
    const [row] = findingsList(rec.database, { days: 0 }, T0);
    const detail = findingDetail(rec.database, String(row!.id))!;
    expect(detail.body).not.toContain(key);
    expect(detail.suggestion).toBe('const url = allowlisted(req.body.url);');
    expect(detail).toMatchObject({ start_line: 9, line: 10, owner: 'o', repo: 'r', model: 'm' });
  });

  it('keeps the list light: no body or suggestion, but says whether a fix exists', async () => {
    await seed(1, { suggestion: 'x' });
    const [row] = findingsList(rec.database, { days: 0 }, T0);
    expect(row).not.toHaveProperty('body');
    expect(row).not.toHaveProperty('suggestion');
    expect(Number(row!.has_fix)).toBe(1);
  });

  it('pages with an offset', async () => {
    await seed(7);
    const first = findingsList(rec.database, { days: 0, limit: 5 }, T0);
    const second = findingsList(rec.database, { days: 0, limit: 5, offset: 5 }, T0);
    expect(first).toHaveLength(5);
    expect(second).toHaveLength(2);
    expect(new Set([...first, ...second].map((r) => r.id)).size).toBe(7);
    expect(findingsList(rec.database, { days: 0, offset: -3 }, T0)).toHaveLength(7);
  });

  it('caps a runaway explanation', async () => {
    await seed(1, { body: 'x'.repeat(20_000) });
    const [row] = findingsList(rec.database, { days: 0 }, T0);
    expect(String(findingDetail(rec.database, String(row!.id))!.body).length).toBe(8000);
  });

  it('returns nothing for an unknown id', () => {
    expect(findingDetail(rec.database, 'nope')).toBeUndefined();
  });

  it('migrates a database created before the new columns', () => {
    const db = new DatabaseSync(path.join(dir, 'old.db'));
    for (const m of MIGRATIONS.slice(0, -1)) db.exec(m);
    db.exec(`PRAGMA user_version = ${MIGRATIONS.length - 1}`);
    migrate(db);
    const cols = (db.prepare('PRAGMA table_info(findings)').all() as Array<{ name: string }>).map((c) => c.name);
    expect(cols).toEqual(expect.arrayContaining(['body', 'suggestion', 'start_line']));
    db.close();
  });
});
