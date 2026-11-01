import { execa } from 'execa';
import type { ReviewFinding } from '../../github/review.js';
import type { ScanContext, ScanFile, Scanner } from '../types.js';
import { isLockfile, parseLockfile, type Dep } from './lockfiles.js';
import { depKey, lookupAdvisories, plain, type Advisory, type OsvOptions } from './osv.js';

export { isLockfile, parseLockfile, type Dep, type Ecosystem } from './lockfiles.js';
export { lookupAdvisories, toAdvisory, type Advisory, type FetchLike, type OsvOptions } from './osv.js';

/**
 * Dependencies: known vulnerabilities, malicious releases, and the shape of a
 * supply-chain compromise.
 *
 * On a pull request this looks only at what the lockfile change adds or moves.
 * A vulnerable package that was already on the default branch is Dependabot's
 * report, and repeating it on every unrelated pull request teaches people to
 * skip this one. An audit, with no base to compare against, looks at all of it.
 */

const RANK: Record<ReviewFinding['severity'], number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

const REGISTRY_TARBALL = /^https:\/\/[^/]+\/.*\/-\/[^/]+\.tgz(?:[?#].*)?$/;

/**
 * The lockfile as it was at `base`: its text, '' when it did not exist there,
 * or undefined when the base commit itself cannot be had.
 */
async function baseText(cwd: string, base: string, file: string): Promise<string | undefined> {
  const has = async () => {
    try {
      await execa('git', ['cat-file', '-e', `${base}^{commit}`], { cwd, timeout: 15_000 });
      return true;
    } catch {
      return false;
    }
  };
  if (!(await has())) {
    // A shallow clone of the head does not have the base commit. Fetch just it.
    try {
      await execa('git', ['fetch', '--depth=1', '--no-tags', 'origin', base], { cwd, timeout: 30_000 });
    } catch {
      return undefined;
    }
    if (!(await has())) return undefined;
  }
  try {
    return (await execa('git', ['show', `${base}:${file}`], { cwd, timeout: 15_000 })).stdout;
  } catch {
    return '';
  }
}

function upgradeCommand(d: Dep, to: string, file: string): string {
  if (d.ecosystem === 'crates.io') return `cargo update -p ${d.name} --precise ${to}`;
  if (d.ecosystem === 'PyPI') {
    if (file.endsWith('poetry.lock')) return `poetry add ${d.name}@^${to}`;
    if (file.endsWith('uv.lock')) return `uv lock --upgrade-package ${d.name}`;
    return `pip install '${d.name}>=${to}'`;
  }
  if (file.endsWith('pnpm-lock.yaml')) return `pnpm update ${d.name}@${to}`;
  if (file.endsWith('yarn.lock')) return `yarn up ${d.name}@${to}`;
  return `npm install ${d.name}@${to}`;
}

function advisoryRow(a: Advisory): string {
  const link = `[${a.id}](https://osv.dev/vulnerability/${encodeURIComponent(a.id)})`;
  const alias = a.aliases.filter((x) => x.startsWith('CVE-')).slice(0, 2).join(', ');
  const fixed = a.fixed.length ? a.fixed.map((v) => `\`${plain(v, 40)}\``).join(', ') : 'none yet';
  return `| ${link} | ${alias || '—'} | ${a.severity} | ${fixed} | ${a.summary || '—'} |`;
}

function vulnerabilityFinding(file: string, d: Dep, advisories: Advisory[]): ReviewFinding {
  const name = plain(d.name, 120);
  const version = plain(d.version, 60);
  const severity = advisories.reduce<ReviewFinding['severity']>((s, a) => (RANK[a.severity] > RANK[s] ? a.severity : s), 'info');
  const base = { file, startLine: d.line, endLine: d.line, lens: 'security' as const, severity };
  const malicious = advisories.filter((a) => a.malicious);

  if (malicious.length) {
    return {
      ...base,
      category: 'CWE-506',
      title: `Malicious package: ${name}@${version}`,
      body:
        `\`${name}@${version}\` is listed as **malicious** by the OpenSSF malicious-packages feed ` +
        `(${malicious.map((a) => `[${a.id}](https://osv.dev/vulnerability/${encodeURIComponent(a.id)})`).join(', ')}). ` +
        `This is not a bug to patch later: the release itself was published to do harm, usually by running code on install ` +
        `that steals tokens and cloud credentials.\n\n` +
        `**Do now:** remove or pin away from this version before anyone installs it; if it has already been installed on ` +
        `a laptop or in CI, treat every credential that machine could read (npm, GitHub, cloud keys, \`.env\`) as compromised and rotate it.` +
        (malicious[0]!.summary ? `\n\n> ${malicious[0]!.summary}` : ''),
    };
  }

  // Per advisory, the first fix above the installed version; across them, the
  // highest of those. A fix from a range this version is not in can be older
  // than what is installed, and suggesting it would be a downgrade.
  const newer = (v: string) => v.localeCompare(d.version, undefined, { numeric: true }) > 0;
  const byVersion = (x: string, y: string) => x.localeCompare(y, undefined, { numeric: true });
  const perAdvisory = advisories.map((a) => a.fixed.filter(newer).sort(byVersion)[0]);
  const fixable = perAdvisory.filter((v): v is string => v !== undefined);
  const target = fixable.sort(byVersion).at(-1);
  const unfixed = advisories.length - fixable.length;
  const cwe = advisories.flatMap((a) => a.cwes)[0];
  return {
    ...base,
    category: 'CWE-1395',
    title: `Vulnerable dependency: ${name}@${version} (${advisories.length} known ${advisories.length === 1 ? 'advisory' : 'advisories'})`,
    body:
      `\`${name}@${version}\` is affected by ${advisories.length === 1 ? 'a published advisory' : `${advisories.length} published advisories`}` +
      `${cwe ? ` (${plain(cwe, 20)})` : ''}.\n\n` +
      `| Advisory | CVE | Severity | Fixed in | Summary |\n|---|---|---|---|---|\n` +
      advisories.slice(0, 10).map(advisoryRow).join('\n') +
      (advisories.length > 10 ? `\n\n…and ${advisories.length - 10} more.` : '') +
      (target
        ? `\n\n**Fix:** move to \`${plain(target, 40)}\` or later — \`${upgradeCommand(d, plain(target, 40), file)}\`, then commit the updated lockfile.` +
          (unfixed ? ` That still leaves ${unfixed} ${unfixed === 1 ? 'advisory' : 'advisories'} with no patched release.` : '')
        : `\n\n**Fix:** no patched release yet. Check whether the vulnerable code path is reachable, or replace the package.`),
  };
}

/** Lockfile hygiene: where a package comes from and whether it can be verified. */
function hygieneFindings(file: string, d: Dep, baseByName: Map<string, Dep[]> | undefined): ReviewFinding[] {
  const out: ReviewFinding[] = [];
  const name = plain(d.name, 120);
  const at = { file, startLine: d.line, endLine: d.line, lens: 'security' as const };
  const src = d.resolved ?? '';

  if (/^http:\/\//i.test(src)) {
    out.push({
      ...at,
      severity: 'high',
      category: 'CWE-494',
      title: `${name} is downloaded over plain HTTP`,
      body: `The lockfile fetches \`${name}\` from \`${plain(src, 120)}\` without TLS, so anyone on the network path can swap the code that gets installed. Point it at an https registry.`,
    });
  } else if (/^(?:git\+|git:|github:|ssh:)/i.test(src) || (/^https:\/\//i.test(src) && d.ecosystem === 'npm' && !REGISTRY_TARBALL.test(src))) {
    out.push({
      ...at,
      severity: 'medium',
      category: 'CWE-494',
      title: `${name} is installed from outside the package registry`,
      body:
        `\`${name}\` resolves to \`${plain(src, 120)}\`, not a registry tarball. A git ref or arbitrary URL can be changed after review, ` +
        `has no registry provenance, and is not covered by advisory databases. Prefer a published version; if this is deliberate, pin a full commit SHA.`,
    });
  } else if (d.ecosystem === 'npm' && src && !d.integrity) {
    out.push({
      ...at,
      severity: 'medium',
      category: 'CWE-353',
      title: `${name} has no integrity hash in the lockfile`,
      body: `Without an \`integrity\` hash the package manager cannot tell whether the tarball it downloads is the one that was locked. Regenerate the lockfile so the hash is recorded.`,
    });
  }

  if (d.installScript && baseByName) {
    const before = baseByName.get(d.name);
    if (!before) {
      out.push({
        ...at,
        severity: 'medium',
        category: 'CWE-829',
        title: `New dependency ${name} runs an install script`,
        body:
          `\`${name}@${plain(d.version, 60)}\` is new in this change and runs code at install time, on every developer machine and CI runner, with their credentials. ` +
          `Confirm it is the package you meant (check the spelling against the real one) and that the script is expected.`,
      });
    } else if (!before.some((b) => b.installScript)) {
      out.push({
        ...at,
        severity: 'high',
        category: 'CWE-829',
        title: `${name} gained an install script in this update`,
        body:
          `\`${name}\` did not run anything on install at ${before.map((b) => `\`${plain(b.version, 60)}\``).join(', ')}; ` +
          `\`${plain(d.version, 60)}\` does. A new install script in a patch or minor release is the signature of a hijacked maintainer account ` +
          `(the 2025 \`chalk\`/\`debug\` and Shai-Hulud compromises worked this way). Read the script in the published tarball before merging, ` +
          `or hold the previous version.`,
      });
    }
  }
  return out;
}

export interface DepsScannerOptions extends OsvOptions {
  /** Upper bound on packages looked up per scan. */
  maxPackages?: number;
}

export function depsScanner(opts: DepsScannerOptions = {}): Scanner {
  const maxPackages = opts.maxPackages ?? 5000;
  return {
    name: 'deps',
    handles: isLockfile,
    // Everything here needs the base commit or the network, so the work is in scanAll.
    scan: () => [],
    async scanAll(files: ScanFile[], ctx: ScanContext): Promise<ReviewFinding[]> {
      const findings: ReviewFinding[] = [];
      const toLookUp: { file: string; dep: Dep }[] = [];

      for (const f of files) {
        const deps = parseLockfile(f.path, f.text);
        const before = ctx.base ? await baseText(ctx.cwd, ctx.base, f.path) : undefined;
        const baseDeps = before === undefined ? undefined : parseLockfile(f.path, before);
        const baseKeys = new Set(baseDeps?.map(depKey));
        const baseByName = baseDeps && new Map<string, Dep[]>();
        for (const b of baseDeps ?? []) baseByName?.set(b.name, [...(baseByName.get(b.name) ?? []), b]);

        const changed = baseDeps ? deps.filter((d) => !baseKeys.has(depKey(d))) : deps;
        for (const d of changed) {
          findings.push(...hygieneFindings(f.path, d, baseByName));
          toLookUp.push({ file: f.path, dep: d });
        }
      }

      if (toLookUp.length === 0) return findings;
      const capped = toLookUp.slice(0, maxPackages);
      const result = await lookupAdvisories(
        capped.map((t) => t.dep),
        opts,
      );
      const first = capped[0]!;
      if (!result.ok) {
        findings.push({
          file: first.file,
          startLine: 1,
          endLine: 1,
          lens: 'security',
          severity: 'info',
          category: 'deps-unchecked',
          title: 'Dependency advisories were not checked',
          body: `The advisory lookup failed (${plain(result.reason, 120)}), so ${capped.length} changed package(s) were not checked for known vulnerabilities or malicious releases. Re-run the scan; this is not a clean result.`,
        });
        return findings;
      }
      // One package hoisted into several install paths is one problem, reported once.
      const reported = new Set<string>();
      for (const { file, dep } of capped) {
        const advisories = result.advisories.get(depKey(dep));
        const key = `${file}|${depKey(dep)}`;
        if (!advisories?.length || reported.has(key)) continue;
        reported.add(key);
        findings.push(vulnerabilityFinding(file, dep, advisories));
      }
      if (toLookUp.length > capped.length) {
        findings.push({
          file: first.file,
          startLine: 1,
          endLine: 1,
          lens: 'security',
          severity: 'info',
          category: 'deps-unchecked',
          title: `Only the first ${capped.length} of ${toLookUp.length} packages were checked`,
          body: `The lockfile change is larger than the per-scan limit. Run \`/audit\` for the rest.`,
        });
      }
      return findings;
    },
  };
}
