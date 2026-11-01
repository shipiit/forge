import { describe, it, expect } from 'vitest';
import { ruleLabel } from '../../web/src/lib/cwe.js';

describe('ruleLabel', () => {
  it.each([
    ['CWE-89', 'CWE-89 · SQL injection'],
    ['cwe-918 SSRF via fetch', 'CWE-918 · SSRF'],
    ['CWE-1395', 'CWE-1395 · Vulnerable dependency'],
    ['CWE-99999', 'CWE-99999'],
    ['checkov:CKV_DOCKER_3', 'checkov:CKV_DOCKER_3'],
    ['  logic  ', 'logic'],
    ['', 'uncategorised'],
    [null, 'uncategorised'],
    [undefined, 'uncategorised'],
  ])('%j → %j', (input, want) => expect(ruleLabel(input)).toBe(want));
});
