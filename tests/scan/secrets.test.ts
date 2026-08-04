import { describe, it, expect } from 'vitest';
import { secretsScanner, entropy, looksRandom } from '../../src/scan/secrets.js';

const scan = (path: string, text: string) => secretsScanner.scan({ path, text }, { cwd: '.' });

describe('entropy', () => {
  it('separates a real key from a placeholder of the same length', () => {
    // This is the whole basis for reporting a generic assignment at all.
    expect(entropy('aaaaaaaaaaaaaaaa')).toBeLessThan(1);
    expect(entropy('kR8pQ2mZ7xL4vN1wYt3Bc')).toBeGreaterThan(3.5);
  });

  it('rejects long values that are not random', () => {
    expect(looksRandom('your-api-key-here')).toBe(false);
    expect(looksRandom('/usr/local/share/config')).toBe(false);
    expect(looksRandom('https://example.com/a/b/c')).toBe(false);
    expect(looksRandom('a sentence that is quite long')).toBe(false);
    expect(looksRandom('short')).toBe(false);
  });
});

describe('provider tokens', () => {
  it('finds the ones with an unmistakable shape', () => {
    const cases: Array<[string, string]> = [
      ['ghp_a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8', 'GitHub'],
      ['AKIAQ7RZ4N2XKD9WPLMV', 'AWS'],
      ['sk-ant-api03-R7kQ2mZ9xL4vN1wYt3BcP6sJ8dF5gH0aE2rT4uI7oK', 'Anthropic'],
      ['AIzaBc3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8s9', 'Google'],
      ['xoxb-123456789012-abcdefghijkl', 'Slack'],
      ['postgres://admin:hunter2@db.internal:5432/app', 'connection string'],
    ];
    for (const [secret, label] of cases) {
      const found = scan('src/config.ts', `const k = "${secret}";`);
      expect(found.length, label).toBeGreaterThan(0);
      expect(found[0]!.severity, label).toBe('critical');
    }
  });

  it('never prints the secret back in full', () => {
    // A finding is a public comment on a public pull request.
    const secret = 'ghp_a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8';
    const body = scan('src/a.ts', `const t = "${secret}";`)[0]!.body;
    expect(body).not.toContain(secret);
    expect(body).toContain('…');
  });
});

describe('not shouting about things that are not secrets', () => {
  it('ignores an obvious placeholder', () => {
    expect(scan('src/a.ts', 'const key = "your-api-key-here";')).toHaveLength(0);
    expect(scan('src/a.ts', 'const token = "REPLACE_ME_WITH_TOKEN";')).toHaveLength(0);
  });

  it('downgrades a provider token in docs rather than dropping it', () => {
    // People do paste real keys into a README. Staying silent there is silent
    // exactly where the mistake is easiest to make.
    const found = scan('README.md', 'ANTHROPIC_API_KEY=sk-ant-api03-R7kQ2mZ9xL4vN1wYt3BcP6sJ8dF5gH0a');
    expect(found).toHaveLength(1);
    expect(found[0]!.severity).toBe('medium');
    expect(found[0]!.body).toContain('may be an example');
  });

  it('does not report a generic assignment in documentation at all', () => {
    // Without a provider shape there is nothing to distinguish it from prose.
    expect(scan('.env.example', 'API_KEY=abc123def456ghi789')).toHaveLength(0);
    expect(scan('docs/setup.md', 'const token = "kR8pQ2mZ7xL4vN1wYt3Bc";')).toHaveLength(0);
  });

  it('skips lockfiles, which are full of high-entropy hashes', () => {
    expect(secretsScanner.handles('package-lock.json')).toBe(false);
    expect(secretsScanner.handles('yarn.lock')).toBe(false);
    expect(secretsScanner.handles('src/index.ts')).toBe(true);
  });

  it('does not fire on ordinary code', () => {
    const code = [
      'const config = { timeout: 30_000, retries: 3 };',
      'export function tokenize(input: string) { return input.split(" "); }',
      'const passwordField = form.querySelector("#password");',
      'import { createHash } from "node:crypto";',
    ].join('\n');
    expect(scan('src/util.ts', code)).toHaveLength(0);
  });

  it('reports a random-looking credential in real code', () => {
    const found = scan('src/db.ts', 'const password = "kR8pQ2mZ7xL4vN1wYt3Bc";');
    expect(found).toHaveLength(1);
    expect(found[0]!.severity).toBe('high');
  });

  it('lowers a generic one in tests, without hiding it', () => {
    const found = scan('tests/db.test.ts', 'const password = "kR8pQ2mZ7xL4vN1wYt3Bc";');
    expect(found[0]!.severity).toBe('medium');
  });
});

describe('the placeholder test reads the token, not the prose', () => {
  it('still reports a real key on a line that happens to say "your"', () => {
    // Found end-to-end, not by a unit test: "Set KEY=sk-ant-… in your shell"
    // was dropped because the sentence contained "your".
    const found = scan('docs/setup.md', 'Set ANTHROPIC_API_KEY=sk-ant-api03-R7kQ2mZ9xL4vN1wYt3BcP6sJ8dF5gH0a in your shell.');
    expect(found).toHaveLength(1);
    expect(found[0]!.severity).toBe('medium');
  });

  it('still drops one that is a placeholder in itself', () => {
    expect(scan('src/a.ts', 'const k = "sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxx";')).toHaveLength(0);
    expect(scan('src/a.ts', 'const k = "AKIAIOSFODNN7EXAMPLE";')).toHaveLength(0);
  });
});

describe('names are not values', () => {
  it('ignores an environment variable name assigned to a secret-ish key', () => {
    // `secretName: 'ANTHROPIC_API_KEY'` is the name of the thing to look up.
    // Words joined by separators score high on entropy and carry no secret.
    expect(scan('src/a.ts', "  secretName: 'ANTHROPIC_API_KEY',")).toHaveLength(0);
    expect(scan('src/a.ts', "  secretInput: 'anthropic-api-key',")).toHaveLength(0);
    expect(scan('src/a.ts', '  const tokenHeader = "authorization-bearer-token";')).toHaveLength(0);
  });

  it('still catches a real key, which does not decompose into words', () => {
    expect(scan('src/a.ts', 'const secret = "kR8pQ2mZ7xL4vN1wYt3Bc";')).toHaveLength(1);
  });
});

describe('a PEM header without key material', () => {
  it('is documentation, not a leak', () => {
    // Install guides and UI copy show the header followed by an ellipsis.
    const doc = 'PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\\n..."';
    expect(scan('web/src/AppInstall.tsx', doc)).toHaveLength(0);
  });

  it('is a leak once the body is there', () => {
    const real = ['-----BEGIN RSA PRIVATE KEY-----', 'MIIEowIBAAKCAQEAx' + 'k3Jd9Qm2Vb7Rt5Yz'.repeat(3), '-----END RSA PRIVATE KEY-----'].join('\n');
    expect(scan('src/key.ts', real)).toHaveLength(1);
  });
});

describe('interpolated values', () => {
  it('are not hardcoded secrets, by definition', () => {
    // `max-output-tokens: "${c.maxOutputTokens.trim()}"` is code being
    // generated, not a credential being committed.
    expect(scan('src/gen.ts', 'lines.push(`  token: "${c.value.trim()}"`);')).toHaveLength(0);
    expect(scan('src/gen.ts', 'const secret = "${{ secrets.API_KEY }}";')).toHaveLength(0);
    expect(scan('src/gen.sh', 'export TOKEN="$(cat /run/secrets/token)"')).toHaveLength(0);
  });
});
