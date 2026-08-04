import { describe, it, expect } from 'vitest';
import { applySuppressions, parseSuppressions } from '../../src/scan/suppress.js';
import { secretsScanner } from '../../src/scan/secrets.js';

const scanWithSuppressions = (path: string, text: string) =>
  applySuppressions(secretsScanner.scan({ path, text }, { cwd: '.' }), text, 'secrets');

describe('reading the markers', () => {
  it('takes a bare marker on the line', () => {
    expect(parseSuppressions('const a = 1; // forge-ignore')).toContainEqual({ line: 1, rules: [] });
  });

  it('takes named rules', () => {
    const [s] = parseSuppressions('const a = 1; // forge-ignore: secrets, cwe-798');
    expect(s!.rules).toEqual(['secrets', 'cwe-798']);
  });

  it('does not mistake the reason for a rule', () => {
    const [s] = parseSuppressions('const a = 1; // forge-ignore: secrets — fixture for the scanner');
    expect(s!.rules).toEqual(['secrets']);
  });

  it('lets a marker on its own line cover the line below', () => {
    const lines = parseSuppressions('// forge-ignore: secrets\nconst token = "x";').map((s) => s.line);
    expect(lines).toContain(2);
  });
});

describe('dismissing a finding', () => {
  const secret = 'ghp_a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8'; // forge-ignore: secrets

  it('drops one the line asked to dismiss', () => {
    expect(scanWithSuppressions('src/a.ts', `const t = "${secret}";`)).toHaveLength(1);
    expect(scanWithSuppressions('src/a.ts', `const t = "${secret}"; // forge-ignore`)).toHaveLength(0);
  });

  it('accepts the scanner name, the CWE, or the lens', () => {
    for (const rule of ['secrets', 'CWE-798', 'cwe798', 'security']) {
      expect(scanWithSuppressions('src/a.ts', `const t = "${secret}"; // forge-ignore: ${rule}`), rule).toHaveLength(0);
    }
  });

  it('keeps a finding a different rule was dismissed for', () => {
    // Suppressing one thing must not quietly suppress the next thing.
    expect(scanWithSuppressions('src/a.ts', `const t = "${secret}"; // forge-ignore: iac`)).toHaveLength(1);
  });

  it('works with the marker on the line above', () => {
    const text = `// forge-ignore: secrets — fixture\nconst t = "${secret}";`;
    expect(scanWithSuppressions('src/a.ts', text)).toHaveLength(0);
  });

  it('does not silence the rest of the file', () => {
    // A dismissal covers the line it sits on, never the file. Otherwise one
    // marker written years ago hides everything added under it since.
    const text = [`const a = "${secret}"; // forge-ignore`, `const b = "${secret}";`].join('\n');
    expect(scanWithSuppressions('src/a.ts', text)).toHaveLength(1);
  });
});
