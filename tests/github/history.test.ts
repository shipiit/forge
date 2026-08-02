import { describe, it, expect } from 'vitest';
import {
  HISTORY_HEADER,
  alreadyRecorded,
  insertHistoryEntry,
  parseHistoryPayload,
  renderHistoryEntry,
  renderHistoryFile,
  historyFilename,
  type HistoryEntry,
} from '../../src/github/history.js';
import { routeEvent, REVIEW_ALWAYS_LABEL } from '../../src/github/router.js';

const entry = (over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  date: '2026-08-02',
  title: 'Add response caching',
  pullNumber: 42,
  author: 'octocat',
  summary: 'Responses are now cached for 60s.',
  areas: ['src/cache'],
  risk: 'medium',
  ...over,
});

describe('history entry rendering', () => {
  it('renders a dated heading with the PR reference', () => {
    const md = renderHistoryEntry(entry());
    expect(md).toContain('## 2026-08-02 — Add response caching (#42)');
    expect(md).toContain('**Author:** octocat');
    expect(md).toContain('🟡 medium');
    expect(md).toContain('`src/cache`');
  });

  it('uses a short sha when the change came from a push', () => {
    const md = renderHistoryEntry(entry({ pullNumber: undefined, sha: 'abcdef1234567890' }));
    expect(md).toContain('(`abcdef1`)');
  });

  it('includes notable behaviour changes when present, and omits the section otherwise', () => {
    expect(renderHistoryEntry(entry({ notable: ['Default TTL is now 60s'] }))).toContain('Default TTL is now 60s');
    expect(renderHistoryEntry(entry())).not.toContain('Notable behaviour changes');
  });

  it('flattens newlines in a title so the heading cannot break', () => {
    expect(renderHistoryEntry(entry({ title: 'a\n## injected' }))).not.toMatch(/\n## injected/);
  });
});

describe('history document insertion', () => {
  it('creates the document with a header on first write', () => {
    const doc = insertHistoryEntry('', renderHistoryEntry(entry()));
    expect(doc).toContain(HISTORY_HEADER);
    expect(doc).toContain('Add response caching');
  });

  it('puts newer entries above older ones', () => {
    const first = insertHistoryEntry('', renderHistoryEntry(entry({ title: 'Older', pullNumber: 1 })));
    const second = insertHistoryEntry(first, renderHistoryEntry(entry({ title: 'Newer', pullNumber: 2 })));
    expect(second.indexOf('Newer')).toBeLessThan(second.indexOf('Older'));
  });

  it('keeps the header at the top after many inserts', () => {
    let doc = '';
    for (let i = 1; i <= 5; i++) doc = insertHistoryEntry(doc, renderHistoryEntry(entry({ pullNumber: i })));
    expect(doc.trimStart().startsWith(HISTORY_HEADER)).toBe(true);
    expect(doc.match(/^## /gm)).toHaveLength(5);
  });

  it('preserves every existing entry', () => {
    let doc = insertHistoryEntry('', renderHistoryEntry(entry({ title: 'First', pullNumber: 1 })));
    doc = insertHistoryEntry(doc, renderHistoryEntry(entry({ title: 'Second', pullNumber: 2 })));
    doc = insertHistoryEntry(doc, renderHistoryEntry(entry({ title: 'Third', pullNumber: 3 })));
    for (const t of ['First', 'Second', 'Third']) expect(doc).toContain(t);
  });
});

describe('idempotency', () => {
  it('detects a PR that is already recorded, so a redelivered webhook is a no-op', () => {
    const doc = insertHistoryEntry('', renderHistoryEntry(entry({ pullNumber: 42 })));
    expect(alreadyRecorded(doc, entry({ pullNumber: 42 }))).toBe(true);
    expect(alreadyRecorded(doc, entry({ pullNumber: 43 }))).toBe(false);
  });

  it('detects an already-recorded commit', () => {
    const doc = insertHistoryEntry('', renderHistoryEntry(entry({ pullNumber: undefined, sha: 'abcdef1234' })));
    expect(alreadyRecorded(doc, entry({ pullNumber: undefined, sha: 'abcdef1234' }))).toBe(true);
  });

  it('is false on an empty document', () => {
    expect(alreadyRecorded('', entry())).toBe(false);
  });
});

describe('parsing the model payload', () => {
  it('parses a fenced JSON object', () => {
    const parsed = parseHistoryPayload(
      '```json\n{"summary":"did a thing","areas":["src"],"risk":"low","notable":["x"]}\n```',
    );
    expect(parsed).toEqual({ summary: 'did a thing', areas: ['src'], risk: 'low', notable: ['x'] });
  });

  it('parses a bare object', () => {
    expect(parseHistoryPayload('{"summary":"s","areas":[]}')).toMatchObject({ summary: 's' });
  });

  it('returns null rather than throwing on junk', () => {
    expect(parseHistoryPayload('no json here')).toBeNull();
    expect(parseHistoryPayload('{ broken')).toBeNull();
  });

  it('requires a summary', () => {
    expect(parseHistoryPayload('{"areas":["a"]}')).toBeNull();
  });

  it('drops an invalid risk value instead of trusting it', () => {
    expect(parseHistoryPayload('{"summary":"s","risk":"catastrophic"}')!.risk).toBeUndefined();
  });

  it('filters non-string entries out of arrays', () => {
    expect(parseHistoryPayload('{"summary":"s","areas":["ok",5,null]}')!.areas).toEqual(['ok']);
  });
});

const OPTS = {
  triggerLabel: 'agent-fix',
  mentionHandle: '@shipit-forge',
  autoFix: 'label' as const,
  autoReview: 'off' as const,
};
const repo = { repository: { owner: { login: 'o' }, name: 'r', default_branch: 'main' } };

describe('review subscription label', () => {
  it('re-reviews a subscribed PR on push even when auto-review is off', () => {
    const payload = {
      ...repo,
      action: 'synchronize',
      pull_request: { number: 1, labels: [{ name: REVIEW_ALWAYS_LABEL }] },
    };
    expect(routeEvent('pull_request', payload, OPTS).kind).toBe('review');
  });

  it('does not re-review an unsubscribed PR when auto-review is off', () => {
    const payload = { ...repo, action: 'synchronize', pull_request: { number: 1, labels: [] } };
    expect(routeEvent('pull_request', payload, OPTS).kind).toBe('none');
  });
});

describe('one file per change', () => {
  it('names the file by date, slug, and reference', () => {
    expect(historyFilename(entry())).toBe('2026-08-02-add-response-caching-pr-42.md');
  });

  it('uses the short sha when there is no PR', () => {
    expect(historyFilename(entry({ pullNumber: undefined, sha: 'abcdef1234567' }))).toBe(
      '2026-08-02-add-response-caching-abcdef1.md',
    );
  });

  it('never collides for two changes with the same title', () => {
    const a = historyFilename(entry({ pullNumber: 1 }));
    const b = historyFilename(entry({ pullNumber: 2 }));
    expect(a).not.toBe(b);
  });

  it('slugs a title with punctuation into a safe filename', () => {
    const name = historyFilename(entry({ title: 'Fix: the API/handler (v2)!' }));
    expect(name).toMatch(/^[a-z0-9.-]+\.md$/);
    expect(name).not.toContain('/');
  });

  it('falls back when a title slugs to nothing', () => {
    expect(historyFilename(entry({ title: '!!!' }))).toContain('change');
  });

  it('sorts chronologically in a directory listing', () => {
    const names = [
      historyFilename(entry({ date: '2026-08-02' })),
      historyFilename(entry({ date: '2026-01-15' })),
    ].sort();
    expect(names[0]).toContain('2026-01-15');
  });

  it('renders the file as a standalone document', () => {
    const file = renderHistoryFile(entry());
    expect(file).toContain('## 2026-08-02 — Add response caching (#42)');
    expect(file.endsWith('\n')).toBe(true);
  });
});
