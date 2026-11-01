/**
 * The supply-chain demo, from a real run: three packages added to a lockfile
 * and what OSV.dev said about each (debug@4.4.2 and lodash@4.17.15 verified
 * against the live API; left-pad@1.3.0 has no advisories).
 */

export type Verdict = 'malicious' | 'vulnerable' | 'clean';

export interface CheckedPackage {
  name: string;
  version: string;
  line: number;
  verdict: Verdict;
  label: string;
}

export const PACKAGES: CheckedPackage[] = [
  { name: 'left-pad', version: '1.3.0', line: 6, verdict: 'clean', label: 'no advisories' },
  { name: 'debug', version: '4.4.2', line: 7, verdict: 'malicious', label: 'malicious release · MAL-2025-46974' },
  { name: 'lodash', version: '4.17.15', line: 8, verdict: 'vulnerable', label: '6 advisories · fixed in 4.18.0' },
];

export const ADVISORIES: Array<[id: string, cve: string, severity: string, fixed: string]> = [
  ['GHSA-35jh-r3h4-6jhm', 'CVE-2021-23337', 'high', '4.17.21'],
  ['GHSA-r5fr-rjxr-66jc', 'CVE-2026-4800', 'high', '4.18.0'],
  ['GHSA-p6mc-m468-83gw', 'CVE-2020-8203', 'high', '4.17.19'],
];

/**
 * The demo's beats, in order: each package appears, then is checked; then the
 * two findings are posted. `beat` counts how many have happened.
 */
export const BEATS = PACKAGES.length * 2 + 2;

export function packageState(beat: number, i: number): 'hidden' | 'checking' | 'done' {
  if (beat <= i * 2) return 'hidden';
  return beat === i * 2 + 1 ? 'checking' : 'done';
}

export function findingsShown(beat: number): number {
  return Math.max(0, beat - PACKAGES.length * 2);
}
