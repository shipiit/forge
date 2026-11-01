import type { ScriptLine } from '../player/ScriptPlayer';

/**
 * What Forge does, each with a short run of what you would see. Every line
 * describes behaviour the handlers implement; numbers are illustrative.
 */

export type CapabilityIcon = 'fix' | 'review' | 'shield' | 'audit' | 'ci' | 'mention' | 'history' | 'routine' | 'help';

export interface Capability {
  id: string;
  icon: CapabilityIcon;
  title: string;
  trigger: string;
  summary: string;
  run: ScriptLine[];
}

export const CAPABILITIES: Capability[] = [
  {
    id: 'review',
    icon: 'review',
    title: 'Review every pull request',
    trigger: 'Automatic · /review',
    summary: 'Scanners, then reviewers, then a verifier. Inline comments with one-click fixes, on the changed lines only.',
    run: [
      { kind: 'trigger', text: 'pull_request opened #214 · feat/avatar-url' },
      { kind: 'step', text: 'rules from main: REVIEW.md, AGENTS.md' },
      { kind: 'step', text: 'scanners: secrets · code · iac · deps — 0 findings' },
      { kind: 'step', text: 'reviewer: 2 candidate findings' },
      { kind: 'step', text: 'verifier: SSRF confirmed · "req.user may be undefined" dropped' },
      { kind: 'result', text: 'review posted: 1 inline comment with a suggested change' },
    ],
  },
  {
    id: 'fix',
    icon: 'fix',
    title: 'Fix an issue, open a PR',
    trigger: 'Label agent-fix · /fix',
    summary: 'Finds the root cause, edits the code, adds a regression test, runs the suite, and opens a PR that closes the issue.',
    run: [
      { kind: 'trigger', text: '/fix on #88 "search returns node_modules results"' },
      { kind: 'step', text: 'read src/agent/tools/search.ts, found the missing ignore list' },
      { kind: 'step', text: 'edit search.ts · add search.test.ts (fails first)' },
      { kind: 'step', text: 'npm test → 412 passed' },
      { kind: 'step', text: 'self-review of the diff: clean' },
      { kind: 'result', text: 'opened PR #129 "Fix: search excludes node_modules" · Closes #88' },
    ],
  },
  {
    id: 'scan',
    icon: 'shield',
    title: 'Security & supply-chain scan',
    trigger: 'Auto on PRs · /secrets',
    summary: 'Secrets, injection, infrastructure and every package a lockfile adds — free, no model, and a check you can require.',
    run: [
      { kind: 'trigger', text: 'pull_request synchronize #301' },
      { kind: 'step', text: 'changed: package-lock.json, .github/workflows/release.yml' },
      { kind: 'step', text: 'deps: 3 new packages checked against OSV.dev' },
      { kind: 'note', text: 'critical · debug@4.4.2 is a malicious release (MAL-2025-46974)' },
      { kind: 'note', text: 'high · actions/checkout pinned to a mutable tag' },
      { kind: 'result', text: 'check run: 2 findings to resolve before merging' },
    ],
  },
  {
    id: 'audit',
    icon: 'audit',
    title: 'Whole-repository audit',
    trigger: '/audit',
    summary: 'The whole tree, not a diff: maps entry points, follows untrusted input to dangerous sinks, one grouped report.',
    run: [
      { kind: 'trigger', text: '/audit on main' },
      { kind: 'step', text: 'repo map: 214 files, 31 HTTP routes' },
      { kind: 'step', text: 'scanners over every tracked file' },
      { kind: 'step', text: 'agent: following request data to sql, shell, fetch, file paths' },
      { kind: 'result', text: 'report: 2 high, 5 medium, grouped by rule with every location' },
    ],
  },
  {
    id: 'ci',
    icon: 'ci',
    title: 'Fix failing CI',
    trigger: 'On a red check',
    summary: 'Reads the failing logs on its own branches, fixes the code, re-runs the tests. Two attempts, then it stops.',
    run: [
      { kind: 'trigger', text: 'check_suite failed on forge/fix-88' },
      { kind: 'step', text: 'typecheck: search.ts(41) — string is not assignable to RegExp' },
      { kind: 'step', text: 'edit search.ts · npm run typecheck → clean' },
      { kind: 'result', text: 'pushed ci-fix commit (attempt 1/2)' },
    ],
  },
  {
    id: 'mention',
    icon: 'mention',
    title: 'Answer @mentions',
    trigger: '@shipit-forge …',
    summary: 'Explains code on an issue; on a PR from this repository it can push the follow-up commit you asked for.',
    run: [
      { kind: 'trigger', text: '@shipit-forge add a test for the empty-list case' },
      { kind: 'step', text: 'collaborator with write access: allowed' },
      { kind: 'step', text: 'add test, run the suite → passed' },
      { kind: 'result', text: 'pushed a follow-up commit to feat/avatar-url' },
    ],
  },
  {
    id: 'help',
    icon: 'help',
    title: 'Answer “how do I…?”',
    trigger: '/help <question>',
    summary: 'Reads the code and answers with numbered steps, real paths and commands, and how to check it worked.',
    run: [
      { kind: 'trigger', text: '/help how do I add a new provider?' },
      { kind: 'step', text: 'read src/providers/index.ts, types.ts, one existing adapter' },
      { kind: 'result', text: 'reply: 5 steps, the files to touch, and the test to run' },
    ],
  },
  {
    id: 'history',
    icon: 'history',
    title: 'Document every change',
    trigger: 'On merge',
    summary: 'One history entry per merged change, written from that diff alone — what, why, areas touched, risk. Arrives as a PR.',
    run: [
      { kind: 'trigger', text: 'pull_request merged #128 "Add response caching"' },
      { kind: 'step', text: 'read the merged diff only' },
      { kind: 'result', text: 'opened a PR adding the entry to docs/HISTORY.md · risk: medium' },
    ],
  },
  {
    id: 'routines',
    icon: 'routine',
    title: 'Run saved routines',
    trigger: 'Cron · /run · events',
    summary: 'A saved skill plus its triggers: a nightly digest, a weekly docs sweep, or a reaction to any repository event.',
    run: [
      { kind: 'trigger', text: 'schedule 0 9 * * * → nightly-digest' },
      { kind: 'step', text: 'skill commit-summary over the last 24h' },
      { kind: 'result', text: 'posted the digest as an issue' },
    ],
  },
];
