import { describe, it, expect } from 'vitest';
import { lookupAdvisories, plain, toAdvisory, type FetchLike } from '../../../src/scan/deps/osv.js';
import type { Dep } from '../../../src/scan/deps/lockfiles.js';

const dep = (name: string, version: string, ecosystem: Dep['ecosystem'] = 'npm'): Dep => ({ ecosystem, name, version, line: 1 });

const LODASH_ADVISORY = {
  id: 'GHSA-p6mc-m468-83gw',
  summary: 'Prototype Pollution in lodash',
  aliases: ['CVE-2020-8203'],
  database_specific: { severity: 'HIGH', cwe_ids: ['CWE-1321'] },
  affected: [
    { package: { name: 'lodash', ecosystem: 'npm' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '3.7.0' }, { fixed: '4.17.19' }] }] },
    { package: { name: 'lodash-es', ecosystem: 'npm' }, ranges: [{ events: [{ fixed: '9.9.9' }] }] },
  ],
};

/** A fake OSV that answers from tables, and records what it was asked. */
function fakeOsv(batch: Record<string, string[]>, details: Record<string, unknown>, opts: { failBatch?: number; failDetail?: boolean } = {}) {
  const calls: string[] = [];
  const f: FetchLike = async (url, init) => {
    calls.push(url);
    if (url.endsWith('/v1/querybatch')) {
      if (opts.failBatch) return { ok: false, status: opts.failBatch, json: async () => ({}) };
      const { queries }: { queries: { package: { name: string }; version: string }[] } = JSON.parse(init.body ?? '{}');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          results: queries.map((q) => {
            const ids = batch[`${q.package.name}@${q.version}`];
            return ids ? { vulns: ids.map((id) => ({ id, modified: '2026-01-01T00:00:00Z' })) } : {};
          }),
        }),
      };
    }
    const id = decodeURIComponent(url.split('/').pop() ?? '');
    if (opts.failDetail || !(id in details)) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => details[id] };
  };
  return { f, calls };
}

describe('toAdvisory', () => {
  it('maps the GitHub rating, CVE alias, CWE and only this package’s fixed version', () => {
    expect(toAdvisory(LODASH_ADVISORY, dep('lodash', '4.17.15'))).toEqual({
      id: 'GHSA-p6mc-m468-83gw',
      aliases: ['CVE-2020-8203'],
      summary: 'Prototype Pollution in lodash',
      severity: 'high',
      fixed: ['4.17.19'],
      cwes: ['CWE-1321'],
      malicious: false,
    });
  });

  it.each([
    ['CRITICAL', 'critical'],
    ['MODERATE', 'medium'],
    ['LOW', 'low'],
    ['weird', 'medium'],
    [undefined, 'medium'],
  ])('rates %s as %s', (rating, expected) => {
    expect(toAdvisory({ id: 'GHSA-x', database_specific: { severity: rating } }, dep('a', '1'))?.severity).toBe(expected);
  });

  it('treats any MAL- entry as critical and malicious', () => {
    const a = toAdvisory({ id: 'MAL-2025-46974', summary: 'Malicious code in debug (npm)' }, dep('debug', '4.4.2'));
    expect(a).toMatchObject({ severity: 'critical', malicious: true });
  });

  it('matches PyPI names however they are spelled', () => {
    const raw = { id: 'PYSEC-1', affected: [{ package: { name: 'Jinja2', ecosystem: 'PyPI' }, ranges: [{ events: [{ fixed: '2.10.1' }] }] }] };
    expect(toAdvisory(raw, dep('jinja2', '2.10', 'PyPI'))?.fixed).toEqual(['2.10.1']);
  });

  it('rejects records without an id', () => {
    expect(toAdvisory(null, dep('a', '1'))).toBeUndefined();
    expect(toAdvisory({ summary: 'x' }, dep('a', '1'))).toBeUndefined();
    expect(toAdvisory([], dep('a', '1'))).toBeUndefined();
  });
});

describe('plain', () => {
  it('strips markup, control and bidi characters, and caps length', () => {
    expect(plain('a <img src=x> `b` [c](d)\n‮evil')).toBe('a img src=x b c(d) evil');
    expect(plain('x'.repeat(300), 10)).toHaveLength(10);
    expect(plain(undefined)).toBe('');
  });
});

describe('lookupAdvisories', () => {
  it('returns advisories for hits and nothing for misses', async () => {
    const { f } = fakeOsv({ 'lodash@4.17.15': ['GHSA-p6mc-m468-83gw'] }, { 'GHSA-p6mc-m468-83gw': LODASH_ADVISORY });
    const res = await lookupAdvisories([dep('lodash', '4.17.15'), dep('left-pad', '1.3.0')], { fetch: f });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.advisories.get('npm|lodash|4.17.15')?.[0]?.severity).toBe('high');
    expect(res.advisories.has('npm|left-pad|1.3.0')).toBe(false);
  });

  it('asks once per unique package, and not at all for an empty list', async () => {
    const { f, calls } = fakeOsv({}, {});
    await lookupAdvisories([dep('a', '1'), dep('a', '1')], { fetch: f });
    expect(calls).toHaveLength(1);
    const empty = fakeOsv({}, {});
    expect(await lookupAdvisories([], { fetch: empty.f })).toEqual({ ok: true, advisories: new Map() });
  });

  it('splits large lockfiles into batches of 1000', async () => {
    const { f, calls } = fakeOsv({}, {});
    await lookupAdvisories(
      Array.from({ length: 2500 }, (_, i) => dep(`p${i}`, '1.0.0')),
      { fetch: f },
    );
    expect(calls.filter((c) => c.endsWith('querybatch'))).toHaveLength(3);
  });

  it('reports a server error as not checked, never as clean', async () => {
    const { f } = fakeOsv({}, {}, { failBatch: 503 });
    expect(await lookupAdvisories([dep('a', '1')], { fetch: f })).toEqual({ ok: false, reason: 'OSV returned 503' });
  });

  it('reports a network failure or timeout as not checked', async () => {
    const f: FetchLike = async () => {
      throw new Error('The operation was aborted due to timeout');
    };
    const res = await lookupAdvisories([dep('a', '1')], { fetch: f });
    expect(res).toEqual({ ok: false, reason: 'The operation was aborted due to timeout' });
  });

  it.each([[{}], [{ results: 'no' }], [{ results: [] }], [null]])('reports a malformed response %j as not checked', async (body) => {
    const f: FetchLike = async () => ({ ok: true, status: 200, json: async () => body });
    const res = await lookupAdvisories([dep('a', '1')], { fetch: f });
    expect(res.ok).toBe(false);
  });

  it('still reports an advisory whose details could not be fetched', async () => {
    const { f } = fakeOsv({ 'debug@4.4.2': ['MAL-2025-46974', 'GHSA-zzzz'] }, {}, { failDetail: true });
    const res = await lookupAdvisories([dep('debug', '4.4.2')], { fetch: f });
    if (!res.ok) throw new Error('expected ok');
    expect(res.advisories.get('npm|debug|4.4.2')).toEqual([
      expect.objectContaining({ id: 'MAL-2025-46974', severity: 'critical', malicious: true }),
      expect.objectContaining({ id: 'GHSA-zzzz', severity: 'medium', malicious: false }),
    ]);
  });

  it('fetches malicious entries first when the detail cap bites', async () => {
    const { f, calls } = fakeOsv({ 'x@1': ['GHSA-a', 'GHSA-b', 'MAL-1'] }, { 'MAL-1': { id: 'MAL-1' } });
    await lookupAdvisories([dep('x', '1')], { fetch: f, maxDetails: 1 });
    expect(calls.filter((c) => c.includes('/v1/vulns/'))).toEqual(['https://api.osv.dev/v1/vulns/MAL-1']);
  });
});
