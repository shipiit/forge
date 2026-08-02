import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  BUILTIN_PATTERNS,
  createScanner,
  createWorkspaceScanner,
  globToRegExp,
  isRiskyRegex,
  loadCustomPatterns,
  scanContent,
  MAX_REMINDER_CHARS,
} from '../../../src/agent/tools/security.js';
import { writeFile } from '../../../src/agent/tools/fs.js';

async function tmpdir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'forge-sec-'));
}

describe('built-in security patterns', () => {
  const hit = (file: string, content: string) =>
    scanContent(BUILTIN_PATTERNS, file, content).map((h) => h.rule);

  it('flags dynamic code execution', () => {
    expect(hit('a.js', 'const r = eval(userInput)')).toContain('dynamic_code_execution');
    expect(hit('a.js', 'child_process.exec(cmd)')).toContain('dynamic_code_execution');
  });

  it('flags unsafe deserialization', () => {
    expect(hit('a.py', 'pickle.loads(blob)')).toContain('unsafe_deserialization');
    expect(hit('a.py', 'yaml.load(f)')).toContain('unsafe_deserialization');
  });

  it('flags DOM injection sinks', () => {
    expect(hit('a.tsx', '<div dangerouslySetInnerHTML={{__html: x}} />')).toContain('dom_injection');
    expect(hit('a.js', 'el.innerHTML = userInput')).toContain('dom_injection');
  });

  it('flags hardcoded credentials', () => {
    expect(hit('a.ts', 'const k = "AKIAIOSFODNN7EXAMPLE"')).toContain('hardcoded_credential');
  });

  it('flags weak hashing', () => {
    expect(hit('a.js', "crypto.createHash('md5')")).toContain('weak_crypto');
  });

  it('flags workflow edits by PATH, regardless of content', () => {
    expect(hit('.github/workflows/ci.yml', 'name: CI')).toContain('workflow_file_edit');
    expect(hit('src/index.ts', 'name: CI')).not.toContain('workflow_file_edit');
  });

  it('stays silent on ordinary code', () => {
    expect(hit('a.ts', 'export const sum = (a: number, b: number) => a + b;')).toEqual([]);
  });
});

describe('glob matching', () => {
  it('matches ** across directories, including zero', () => {
    expect(globToRegExp('**/.github/workflows/**').test('.github/workflows/ci.yml')).toBe(true);
    expect(globToRegExp('**/src/tenants/**').test('packages/api/src/tenants/db.py')).toBe(true);
    expect(globToRegExp('**/src/tenants/**').test('src/other/db.py')).toBe(false);
  });

  it('* does not cross a directory boundary', () => {
    expect(globToRegExp('src/*.ts').test('src/a.ts')).toBe(true);
    expect(globToRegExp('src/*.ts').test('src/nested/a.ts')).toBe(false);
  });

  it('escapes regex metacharacters in literal segments', () => {
    expect(globToRegExp('a.b').test('a.b')).toBe(true);
    expect(globToRegExp('a.b').test('axb')).toBe(false);
  });
});

describe('ReDoS guard', () => {
  it('rejects nested quantifiers', () => {
    expect(isRiskyRegex('(a+)+')).toBe(true);
    expect(isRiskyRegex('(x*)*')).toBe(true);
  });

  it('rejects absurdly long patterns', () => {
    expect(isRiskyRegex('a'.repeat(600))).toBe(true);
  });

  it('allows ordinary patterns', () => {
    expect(isRiskyRegex('\\.objects\\.all\\(\\)')).toBe(false);
  });

  it('skips a risky rule instead of running it', () => {
    const hits = scanContent(
      [{ rule_name: 'redos', regex: '(a+)+$', reminder: 'x' }],
      'a.ts',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaa!',
    );
    expect(hits).toEqual([]);
  });

  it('skips an invalid regex without throwing', () => {
    expect(scanContent([{ rule_name: 'bad', regex: '([', reminder: 'x' }], 'a.ts', 'x')).toEqual([]);
  });
});

describe('custom repo rules', () => {
  it('loads rules from .forge/security-patterns.json', async () => {
    const dir = await tmpdir();
    await fs.mkdir(path.join(dir, '.forge'), { recursive: true });
    await fs.writeFile(
      path.join(dir, '.forge/security-patterns.json'),
      JSON.stringify({
        patterns: [
          { rule_name: 'internal_key', substrings: ['sk_live_'], reminder: 'Use the secret manager.' },
          { rule_name: 'no_name' },
        ],
      }),
    );
    const rules = await loadCustomPatterns(dir);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.rule_name).toBe('internal_key');
  });

  it('returns [] when the file is absent or malformed', async () => {
    const dir = await tmpdir();
    expect(await loadCustomPatterns(dir)).toEqual([]);
    await fs.mkdir(path.join(dir, '.forge'), { recursive: true });
    await fs.writeFile(path.join(dir, '.forge/security-patterns.json'), 'not json');
    expect(await loadCustomPatterns(dir)).toEqual([]);
  });

  it('applies path scoping from a custom rule', async () => {
    const rules = [
      {
        rule_name: 'tenant_unfiltered_query',
        regex: '\\.objects\\.all\\(\\)',
        paths: ['**/src/tenants/**'],
        reminder: 'Filter by org_id.',
      },
    ];
    expect(scanContent(rules, 'src/tenants/db.py', 'User.objects.all()')).toHaveLength(1);
    expect(scanContent(rules, 'src/other/db.py', 'User.objects.all()')).toHaveLength(0);
  });

  it('honours exclude_paths', () => {
    const rules = [
      { rule_name: 'r', substrings: ['eval('], exclude_paths: ['**/tests/**'], reminder: 'no eval' },
    ];
    expect(scanContent(rules, 'src/a.ts', 'eval(x)')).toHaveLength(1);
    expect(scanContent(rules, 'tests/a.ts', 'eval(x)')).toHaveLength(0);
  });

  it('merges built-ins with repo rules', async () => {
    const dir = await tmpdir();
    await fs.mkdir(path.join(dir, '.forge'), { recursive: true });
    await fs.writeFile(
      path.join(dir, '.forge/security-patterns.json'),
      JSON.stringify({ patterns: [{ rule_name: 'custom', substrings: ['FORBIDDEN'], reminder: 'no' }] }),
    );
    const scanner = await createWorkspaceScanner(dir);
    expect(scanner.scan('a.ts', 'eval(x)').map((h) => h.rule)).toContain('dynamic_code_execution');
    expect(scanner.scan('b.ts', 'FORBIDDEN').map((h) => h.rule)).toContain('custom');
  });
});

describe('scanner state', () => {
  it('warns once per rule per file, so repeats do not flood context', () => {
    const s = createScanner();
    expect(s.scan('a.ts', 'eval(x)')).toHaveLength(1);
    expect(s.scan('a.ts', 'eval(y)')).toHaveLength(0);
    expect(s.scan('b.ts', 'eval(x)')).toHaveLength(1); // different file warns again
  });

  it('formats hits as actionable text, and nothing when clean', () => {
    const s = createScanner();
    expect(s.format([])).toBe('');
    const text = s.format(s.scan('a.ts', 'eval(x)'));
    expect(text).toContain('Security check');
    expect(text).toContain('dynamic_code_execution');
  });

  it('caps a reminder so one rule cannot flood the context', () => {
    const hits = scanContent(
      [{ rule_name: 'r', substrings: ['x'], reminder: 'y'.repeat(5000) }],
      'a.ts',
      'x',
    );
    expect(hits[0]!.reminder.length).toBe(MAX_REMINDER_CHARS);
  });
});

describe('write tools surface the warning to the agent', () => {
  it('appends a security note to write_file output', async () => {
    const dir = await tmpdir();
    const out = await writeFile.run(
      { path: 'a.js', content: 'const r = eval(userInput)' },
      { cwd: dir, supportsVision: true, security: createScanner() },
    );
    const text = (out[0] as any).text as string;
    expect(text).toContain('Wrote');
    expect(text).toContain('dynamic_code_execution');
  });

  it('says nothing extra when the content is clean', async () => {
    const dir = await tmpdir();
    const out = await writeFile.run(
      { path: 'a.js', content: 'export const x = 1' },
      { cwd: dir, supportsVision: true, security: createScanner() },
    );
    expect((out[0] as any).text).not.toContain('Security check');
  });

  it('is a no-op when no scanner is configured', async () => {
    const dir = await tmpdir();
    const out = await writeFile.run(
      { path: 'a.js', content: 'eval(x)' },
      { cwd: dir, supportsVision: true },
    );
    expect((out[0] as any).text).not.toContain('Security check');
  });

  it('never blocks the write — the file is still created', async () => {
    const dir = await tmpdir();
    await writeFile.run(
      { path: 'a.js', content: 'eval(x)' },
      { cwd: dir, supportsVision: true, security: createScanner() },
    );
    expect(await fs.readFile(path.join(dir, 'a.js'), 'utf8')).toBe('eval(x)');
  });
});
