import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Deterministic per-edit security check.
 *
 * Every time the agent writes a file, the new content is scanned for known-risky
 * patterns and any hit is appended to the tool result. The agent sees the warning
 * on its next turn and can fix the code before it is ever committed.
 *
 * This is a plain string/regex match — no model call, no tokens, no latency. It
 * is the cheapest layer of defense in depth: it catches the obvious cases so the
 * (expensive) review pass can spend its attention on the subtle ones.
 *
 * It never blocks a write. Findings are advice to the agent, not a gate.
 */

export interface SecurityPattern {
  rule_name: string;
  reminder: string;
  /** Literal substrings to look for. Provide this or `regex`. */
  substrings?: string[];
  /** Regular expression matched against the file content. */
  regex?: string;
  /** Optional globs; the rule applies only to matching paths. */
  paths?: string[];
  /** Optional globs to skip. */
  exclude_paths?: string[];
}

/** Warning text is capped so one rule can't flood the agent's context. */
export const MAX_REMINDER_CHARS = 1024;

/** Upper bound on custom rules loaded from a repository. */
export const MAX_CUSTOM_RULES = 50;

export const BUILTIN_PATTERNS: SecurityPattern[] = [
  {
    rule_name: 'dynamic_code_execution',
    substrings: ['eval(', 'new Function(', 'os.system(', 'child_process.exec(', 'exec('],
    reminder:
      'Dynamic code execution. If any part of this input is attacker-controlled this is remote code execution (CWE-94/CWE-78). Use a parser, an allowlist, or an argument-array API instead of a shell string.',
  },
  {
    rule_name: 'unsafe_deserialization',
    substrings: ['pickle.loads', 'pickle.load(', 'yaml.load(', 'unserialize('],
    reminder:
      'Unsafe deserialization (CWE-502). Deserializing untrusted data can execute arbitrary code. Use a safe loader (e.g. yaml.safe_load) or a schema-validated format like JSON.',
  },
  {
    rule_name: 'dom_injection',
    substrings: ['dangerouslySetInnerHTML', '.innerHTML =', 'document.write(', 'outerHTML ='],
    reminder:
      'Direct DOM injection (CWE-79). Any untrusted value reaching this sink is stored/reflected XSS. Set textContent, or sanitize with a vetted library first.',
  },
  {
    rule_name: 'workflow_file_edit',
    paths: ['**/.github/workflows/**'],
    regex: '[\\s\\S]*',
    reminder:
      'This edits a GitHub Actions workflow, which can grant repository-level permissions and read secrets. Keep permissions minimal and never interpolate untrusted input directly into a run block.',
  },
  {
    rule_name: 'hardcoded_credential',
    substrings: ['sk_live_', 'AKIA', 'BEGIN RSA PRIVATE KEY', 'BEGIN PRIVATE KEY'],
    reminder:
      'This looks like a hardcoded credential (CWE-798). Load it from the environment or a secret manager — never commit it.',
  },
  {
    rule_name: 'weak_crypto',
    substrings: ['createHash("md5")', "createHash('md5')", 'hashlib.md5(', 'createHash("sha1")', "createHash('sha1')"],
    reminder:
      'Weak hash algorithm (CWE-327). MD5/SHA-1 are unsuitable for signatures, passwords, or integrity. Use SHA-256+, or a password KDF such as bcrypt/scrypt/argon2.',
  },
];

/** Convert a glob to a RegExp. Supports `**`, `*`, and `?`. */
export function globToRegExp(glob: string): RegExp {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === '*') {
      if (glob[i + 1] === '*') {
        out += '.*';
        i++;
        if (glob[i + 1] === '/') i++; // `**/` also matches zero directories
      } else {
        out += '[^/]*';
      }
    } else if (c === '?') {
      out += '[^/]';
    } else {
      out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${out}$`);
}

function matchesAnyGlob(globs: string[], filePath: string): boolean {
  const normalized = filePath.replace(/^\.\//, '');
  return globs.some((g) => {
    const re = globToRegExp(g);
    return re.test(normalized) || re.test(`./${normalized}`);
  });
}

/**
 * Reject regexes that look prone to catastrophic backtracking — a nested
 * quantifier such as `(a+)+`. Forge flags ReDoS in its own review prompt; it
 * must not be the thing that ships one.
 */
export function isRiskyRegex(source: string): boolean {
  if (source.length > 500) return true;
  return /\([^)]*[+*][^)]*\)\s*[+*]/.test(source);
}

export interface PatternHit {
  rule: string;
  reminder: string;
}

/** Match one file's content against a pattern set. Pure — no I/O, no state. */
export function scanContent(patterns: SecurityPattern[], filePath: string, content: string): PatternHit[] {
  const hits: PatternHit[] = [];
  for (const p of patterns) {
    if (p.exclude_paths?.length && matchesAnyGlob(p.exclude_paths, filePath)) continue;
    if (p.paths?.length && !matchesAnyGlob(p.paths, filePath)) continue;

    let matched = false;
    if (p.substrings?.length) {
      matched = p.substrings.some((s) => content.includes(s));
    }
    if (!matched && p.regex) {
      if (isRiskyRegex(p.regex)) continue;
      try {
        matched = new RegExp(p.regex).test(content);
      } catch {
        continue; // an invalid rule is skipped, never fatal
      }
    }
    if (matched) {
      hits.push({ rule: p.rule_name, reminder: p.reminder.slice(0, MAX_REMINDER_CHARS) });
    }
  }
  return hits;
}

/**
 * Load repository-specific rules from `.forge/security-patterns.json`.
 * JSON only — deliberately no YAML dependency, so this never fails to load.
 * Returns [] when absent or malformed.
 */
export async function loadCustomPatterns(cwd: string): Promise<SecurityPattern[]> {
  for (const rel of ['.forge/security-patterns.json', '.github/forge/security-patterns.json']) {
    try {
      const raw = await fs.readFile(path.join(cwd, rel), 'utf8');
      const doc = JSON.parse(raw) as { patterns?: unknown };
      if (!Array.isArray(doc?.patterns)) continue;
      const out: SecurityPattern[] = [];
      for (const item of doc.patterns.slice(0, MAX_CUSTOM_RULES)) {
        const p = item as Record<string, unknown>;
        const rule_name = typeof p?.rule_name === 'string' ? p.rule_name : '';
        const reminder = typeof p?.reminder === 'string' ? p.reminder : '';
        if (!rule_name || !reminder) continue;
        const hasMatcher = Array.isArray(p.substrings) || typeof p.regex === 'string';
        if (!hasMatcher) continue;
        out.push({
          rule_name,
          reminder,
          ...(Array.isArray(p.substrings) ? { substrings: p.substrings.map(String) } : {}),
          ...(typeof p.regex === 'string' ? { regex: p.regex } : {}),
          ...(Array.isArray(p.paths) ? { paths: p.paths.map(String) } : {}),
          ...(Array.isArray(p.exclude_paths) ? { exclude_paths: p.exclude_paths.map(String) } : {}),
        });
      }
      return out;
    } catch {
      /* try the next location */
    }
  }
  return [];
}

/**
 * A stateful scanner for one agent run. Each (rule, file) pair warns at most
 * once, so an agent editing the same file repeatedly doesn't drown in repeats.
 */
export interface SecurityScanner {
  scan(filePath: string, content: string): PatternHit[];
  /** Render hits as the text appended to a tool result, or '' when clean. */
  format(hits: PatternHit[]): string;
}

export function createScanner(patterns: SecurityPattern[] = BUILTIN_PATTERNS): SecurityScanner {
  const seen = new Set<string>();
  return {
    scan(filePath, content) {
      const fresh: PatternHit[] = [];
      for (const hit of scanContent(patterns, filePath, content)) {
        const key = `${hit.rule}::${filePath}`;
        if (seen.has(key)) continue;
        seen.add(key);
        fresh.push(hit);
      }
      return fresh;
    },
    format(hits) {
      if (hits.length === 0) return '';
      const lines = hits.map((h) => `- [${h.rule}] ${h.reminder}`);
      return `\n\n⚠️ Security check on this edit:\n${lines.join('\n')}\nFix these now if they apply to the code you just wrote.`;
    },
  };
}

/** Build the scanner for a workspace, merging built-in and repo-specific rules. */
export async function createWorkspaceScanner(cwd: string): Promise<SecurityScanner> {
  const custom = await loadCustomPatterns(cwd);
  return createScanner([...BUILTIN_PATTERNS, ...custom]);
}
