import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { LLMClient } from '../providers/types.js';
import { runAgent } from '../agent/loop.js';
import { editToolset, reviewToolset } from '../agent/tools/registry.js';
import { orchestratorToolset } from '../agent/subagent.js';
import { fixSystemPrompt, reviewSystemPrompt, mentionSystemPrompt, analyzeSystemPrompt } from '../agent/prompts.js';
import { detectTestCommand } from '../agent/tools/tests.js';
import { runCommand } from '../agent/tools/bash.js';
import { buildRepoMap } from '../agent/repomap.js';
import { buildIssueContent, buildReviewContent, type CommentLike } from './context.js';
import { buildReviewPayload, parseFindings, parseDiffValidLines } from './review.js';
import { parseSarif } from './sarif.js';
import { realWorkspace, type RepoRef, type WorkspacePort } from './workspace.js';
import {
  composeFixPrBody,
  fetchPrDiff,
  openPullRequest,
  type OctokitLike,
} from './pr.js';

const MAX_ITER = Number(process.env.MAX_ITERATIONS || 25);
const DISPLAY = process.env.FORGE_DISPLAY_NAME || 'ShipIT Forge';

export interface HandlerDeps {
  octokit: OctokitLike;
  client: LLMClient;
  token: string; // installation token for clone + image download
  log: (msg: string) => void;
  /** Run a self-review pass over the fix diff before opening the PR (default true). */
  selfReview?: boolean;
  /** Optional explicit test command override (from .github/agent.yml). */
  testCommand?: string;
  /** Workspace operations; defaults to real git. Overridden in tests. */
  workspace?: WorkspacePort;
  /** Optional path (in the repo) to a SARIF file to ingest during review. */
  sarifPath?: string;
}

/** Fix an issue end-to-end: clone → investigate/edit → verify → open PR → comment. */
/** Prevent duplicate concurrent runs for the same issue (multiple triggers + smee re-delivery). */
const inFlight = new Set<string>();

/** Collapse repeated lines and cap length so a rambling model summary stays readable. */
export function cleanSummary(text: string, maxChars = 1200): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of (text || '').split('\n')) {
    const line = raw.trimEnd();
    const key = line.trim();
    if (key && seen.has(key)) continue; // drop duplicate non-empty lines (model repetition)
    if (key) seen.add(key);
    out.push(line);
  }
  let s = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (s.length > maxChars) s = s.slice(0, maxChars).trimEnd() + ' …';
  return s || 'Applied a fix.';
}

/**
 * Default issue behavior: investigate (read-only) and post ONE detailed diagnosis
 * comment (root cause + proposed fix). Does NOT open a PR — a maintainer requests
 * that with `/fix`. This is the "take a look and tell me what to fix" flow.
 */
export async function handleIssueAnalyze(
  deps: HandlerDeps,
  args: { owner: string; repo: string; defaultBranch: string; issueNumber: number; issueTitle: string; issueBody: string | null },
): Promise<void> {
  const { octokit, client, token, log } = deps;
  const lockKey = `analyze:${args.owner}/${args.repo}#${args.issueNumber}`;
  if (inFlight.has(lockKey)) {
    log(`Duplicate trigger for issue #${args.issueNumber}; already analyzing, skipping.`);
    return;
  }
  inFlight.add(lockKey);
  const wsOps = deps.workspace ?? realWorkspace;
  try {
    const commentsRes = await octokit.rest.issues.listComments({ owner: args.owner, repo: args.repo, issue_number: args.issueNumber });
    const comments: CommentLike[] = commentsRes.data
      .filter((c) => c.body && !isFromForge(c.user?.login))
      .map((c) => ({ user: c.user?.login ?? 'user', body: c.body! }));

    const ws = await wsOps.clone({ owner: args.owner, repo: args.repo, ref: args.defaultBranch }, token);
    try {
      const repoMap = await buildRepoMap(ws.dir);
      const initialContent = await buildIssueContent(
        { number: args.issueNumber, title: args.issueTitle, body: args.issueBody },
        comments,
        token,
        log,
      );
      initialContent.unshift({ type: 'text', text: repoMap });

      const result = await runAgent({
        client,
        system: analyzeSystemPrompt(),
        initialContent,
        tools: reviewToolset(), // read-only: no edits
        limits: { maxIterations: MAX_ITER, maxOutputTokens: 6144 },
        cwd: ws.dir,
        onEvent: (e) => e.type === 'tool' && log(`tool: ${e.name}`),
      });

      await octokit.rest.issues.createComment({
        owner: args.owner,
        repo: args.repo,
        issue_number: args.issueNumber,
        body:
          `### 🔍 ${DISPLAY} — analysis of #${args.issueNumber}\n\n` +
          `${cleanSummary(result.finalText, 4000)}\n\n` +
          `---\n_Want me to implement this and open a PR — with an automated **security + code review** and tests run on the change? Comment **\`/fix\`** and I'll do it._`,
      });
    } finally {
      await ws.cleanup();
    }
  } finally {
    inFlight.delete(lockKey);
  }
}

export async function handleIssueFix(
  deps: HandlerDeps,
  args: { owner: string; repo: string; defaultBranch: string; issueNumber: number; issueTitle: string; issueBody: string | null },
): Promise<void> {
  const lockKey = `fix:${args.owner}/${args.repo}#${args.issueNumber}`;
  if (inFlight.has(lockKey)) {
    deps.log(`Duplicate trigger for issue #${args.issueNumber}; already running, skipping.`);
    return;
  }
  inFlight.add(lockKey);
  try {
    await doIssueFix(deps, args);
  } finally {
    inFlight.delete(lockKey);
  }
}

async function doIssueFix(
  deps: HandlerDeps,
  args: { owner: string; repo: string; defaultBranch: string; issueNumber: number; issueTitle: string; issueBody: string | null },
): Promise<void> {
  const { octokit, client, token, log } = deps;
  const wsOps = deps.workspace ?? realWorkspace;
  const repoRef: RepoRef = { owner: args.owner, repo: args.repo, ref: args.defaultBranch };
  const branch = `forge/issue-${args.issueNumber}`;

  // Idempotency: if a fix PR for this issue is already open, do nothing.
  const existing = await octokit.rest.pulls.list({
    owner: args.owner,
    repo: args.repo,
    head: `${args.owner}:${branch}`,
    state: 'open',
  });
  if (existing.data.length > 0) {
    log(`fix PR already open for issue #${args.issueNumber} (${existing.data[0]!.html_url}); skipping.`);
    return;
  }

  const commentsRes = await octokit.rest.issues.listComments({ owner: args.owner, repo: args.repo, issue_number: args.issueNumber });
  const comments: CommentLike[] = commentsRes.data
    .filter((c) => c.body && !isFromForge(c.user?.login))
    .map((c) => ({ user: c.user?.login ?? 'user', body: c.body! }));

  const ws = await wsOps.clone(repoRef, token);
  try {
    await wsOps.createBranch(ws, branch);
    const repoMap = await buildRepoMap(ws.dir);
    const initialContent = await buildIssueContent(
      { number: args.issueNumber, title: args.issueTitle, body: args.issueBody },
      comments,
      token,
      log,
    );
    initialContent.unshift({ type: 'text', text: repoMap });

    const fixLimits = { maxIterations: MAX_ITER, maxOutputTokens: 8192 };
    const result = await runAgent({
      client,
      system: fixSystemPrompt(),
      initialContent,
      // Orchestrator toolset: edit tools + spawn_subagent so big fixes can be split up.
      tools: orchestratorToolset({ client, limits: fixLimits, depth: 0, maxDepth: 2, testCommand: deps.testCommand }),
      limits: fixLimits,
      cwd: ws.dir,
      onEvent: (e) => e.type === 'tool' && log(`tool: ${e.name}`),
    });

    // Verify with the project's tests, if any.
    const testCmd = await detectTestCommand(ws.dir, deps.testCommand);
    let testsPassed: boolean | null = null;
    let testOutput = '';
    if (testCmd) {
      const out = await runCommand(testCmd, { cwd: ws.dir, supportsVision: client.supportsVision }, { timeoutMs: 300_000 });
      testOutput = out.map((p) => ('content' in p ? p.content : 'text' in p ? p.text : '')).join('\n');
      testsPassed = /exit_code: 0/.test(testOutput);
    }

    const summary = cleanSummary(result.finalText);
    const committed = await wsOps.commitAll(ws, `fix: ${args.issueTitle}\n\n${summary}`.slice(0, 2000));
    if (!committed) {
      await octokit.rest.issues.createComment({
        owner: args.owner,
        repo: args.repo,
        issue_number: args.issueNumber,
        body: `### 🤔 ${DISPLAY} — no change made\n\n${summary}`,
      });
      return;
    }

    // Capture the diff once: used for self-review and the changed-files list.
    const diff = await wsOps.diffHead(ws);
    const changedFiles = [...diff.matchAll(/^\+\+\+ b\/(.+)$/gm)].map((m) => m[1]).filter((f) => f && f !== '/dev/null');

    // Multi-pass self-review: the agent critiques its own diff before opening the PR.
    let selfReviewNote = '';
    let selfBlocker = false;
    if (deps.selfReview && diff.trim()) {
      const reviewRes = await runAgent({
        client,
        system: reviewSystemPrompt(),
        initialContent: [{ type: 'text', text: `Review your own change before it becomes a PR. Be strict about correctness and regressions.\n\nIssue: ${args.issueTitle}\n\nDiff:\n\`\`\`diff\n${diff}\n\`\`\`` }],
        tools: reviewToolset(),
        limits: { maxIterations: MAX_ITER, maxOutputTokens: 4096 },
        cwd: ws.dir,
      });
      const selfFindings = parseFindings(reviewRes.finalText);
      selfBlocker = selfFindings.some((f) => f.severity === 'critical' || f.severity === 'high');
      const sec = selfFindings.filter((f) => f.lens === 'security');
      const qual = selfFindings.filter((f) => f.lens === 'quality');
      const fmt = (f: (typeof selfFindings)[number]) =>
        `- **${f.severity.toUpperCase()}** \`${f.file}:${f.endLine}\` — **${f.title}**${f.body ? `: ${f.body}` : ''}`;
      selfReviewNote =
        `\n\n## 🛡️ Automated review (security + code)\n` +
        `**Security checks:** ${sec.length ? '\n' + sec.map(fmt).join('\n') : '✅ no security issues found.'}\n\n` +
        `**Code review:** ${qual.length ? '\n' + qual.map(fmt).join('\n') : '✅ no code-quality issues found.'}`;
    }

    await wsOps.pushBranch(ws, branch);

    const verify =
      testsPassed === null ? 'No test suite detected — not auto-verified.'
      : testsPassed ? '✅ Project tests pass after the change.'
      : '⚠️ Tests did **not** pass — opened as a draft for review.';
    const filesBlock = changedFiles.length ? changedFiles.map((f) => `- \`${f}\``).join('\n') : '_(see the PR diff)_';

    const pr = await openPullRequest(octokit, {
      owner: args.owner,
      repo: args.repo,
      title: `Fix: ${args.issueTitle}`.slice(0, 250),
      body: composeFixPrBody({ issueNumber: args.issueNumber, summary, testsPassed, testOutput: testOutput.slice(-3000) }) + selfReviewNote,
      head: branch,
      base: args.defaultBranch,
      draft: testsPassed === false || selfBlocker,
    });

    // ONE rich comment on the issue — root cause + reasoning, files, verification, PR link.
    await octokit.rest.issues.createComment({
      owner: args.owner,
      repo: args.repo,
      issue_number: args.issueNumber,
      body:
        `### 🔧 ${DISPLAY} — fix ready in ${pr.url}\n\n` +
        `**What I found & changed**\n\n${summary}\n\n` +
        `**Files changed**\n${filesBlock}\n\n` +
        `**Verification**\n${verify}\n\n` +
        `Review and merge ${pr.url} to apply the fix.` +
        (selfReviewNote ? `\n${selfReviewNote}` : ''),
    });
  } finally {
    await ws.cleanup();
  }
}

/** Review a PR: clone head → analyze diff → post a review with inline findings. */
export async function handlePrReview(
  deps: HandlerDeps,
  args: { owner: string; repo: string; pullNumber: number; securityOnly?: boolean },
): Promise<void> {
  const { octokit, client, token, log } = deps;
  const prRes = await octokit.rest.pulls.get({ owner: args.owner, repo: args.repo, pull_number: args.pullNumber });
  const diff = await fetchPrDiff(octokit, args.owner, args.repo, args.pullNumber);

  const commentsRes = await octokit.rest.issues.listComments({ owner: args.owner, repo: args.repo, issue_number: args.pullNumber });
  const comments: CommentLike[] = commentsRes.data
    .filter((c) => c.body && !isFromForge(c.user?.login))
    .map((c) => ({ user: c.user?.login ?? 'user', body: c.body! }));

  const ws = await (deps.workspace ?? realWorkspace).clone({ owner: args.owner, repo: args.repo, ref: prRes.data.head.ref }, token);
  try {
    const initialContent = await buildReviewContent(
      { number: args.pullNumber, title: prRes.data.title, body: prRes.data.body },
      diff,
      comments,
      token,
      { securityOnly: args.securityOnly },
      log,
    );
    const result = await runAgent({
      client,
      system: reviewSystemPrompt({ securityOnly: args.securityOnly }),
      initialContent,
      tools: reviewToolset(),
      limits: { maxIterations: MAX_ITER, maxOutputTokens: 8192 },
      cwd: ws.dir,
    });

    const findings = parseFindings(result.finalText);

    // Optionally merge static-analysis (SARIF) findings, e.g. from CodeQL.
    if (deps.sarifPath) {
      try {
        const sarifText = await fs.readFile(path.join(ws.dir, deps.sarifPath), 'utf8');
        const sarifFindings = parseSarif(sarifText);
        findings.push(...sarifFindings);
        log(`ingested ${sarifFindings.length} SARIF finding(s) from ${deps.sarifPath}`);
      } catch (err) {
        log(`SARIF ingest skipped: ${(err as Error).message}`);
      }
    }

    const validLines = parseDiffValidLines(diff);
    const payload = buildReviewPayload(findings, { displayName: DISPLAY, securityOnly: args.securityOnly, validLines });
    await octokit.rest.pulls.createReview({
      owner: args.owner,
      repo: args.repo,
      pull_number: args.pullNumber,
      event: payload.event,
      body: payload.body,
      comments: payload.comments,
    });
  } finally {
    await ws.cleanup();
  }
}

/**
 * Respond to an @mention on a PR by actually changing code: clone the PR head
 * branch, let the agent edit + verify, then push a follow-up commit to that same
 * branch and comment a summary. Falls back to a read-only reply if no change was
 * produced. This is what lets reviewers say "@forge fix this" and get a commit.
 */
export async function handlePrFollowup(
  deps: HandlerDeps,
  args: { owner: string; repo: string; pullNumber: number; question: string },
): Promise<void> {
  const { octokit, client, token, log } = deps;
  const pr = await octokit.rest.pulls.get({ owner: args.owner, repo: args.repo, pull_number: args.pullNumber });
  const headRef = pr.data.head.ref;

  const wsOps = deps.workspace ?? realWorkspace;
  const ws = await wsOps.clone({ owner: args.owner, repo: args.repo, ref: headRef }, token);
  try {
    const repoMap = await buildRepoMap(ws.dir);
    const result = await runAgent({
      client,
      system: mentionSystemPrompt(),
      initialContent: [
        { type: 'text', text: repoMap },
        { type: 'text', text: `You are working on the branch of PR #${args.pullNumber}. Request:\n\n${args.question}\n\nIf code changes are needed, make them and verify with tests.` },
      ],
      tools: editToolset({ testCommand: deps.testCommand }),
      limits: { maxIterations: MAX_ITER, maxOutputTokens: 8192 },
      cwd: ws.dir,
      onEvent: (e) => e.type === 'tool' && log(`tool: ${e.name}`),
    });

    const committed = await wsOps.commitAll(ws, `forge: ${args.question}`.slice(0, 200) + `\n\n${result.finalText}`.slice(0, 3000));
    if (committed) {
      await wsOps.pushBranch(ws, headRef);
      await octokit.rest.issues.createComment({
        owner: args.owner,
        repo: args.repo,
        issue_number: args.pullNumber,
        body: `🔧 ${DISPLAY} pushed a follow-up commit to \`${headRef}\`.\n\n${result.finalText}`,
      });
    } else {
      await octokit.rest.issues.createComment({
        owner: args.owner,
        repo: args.repo,
        issue_number: args.pullNumber,
        body: result.finalText || `${DISPLAY} reviewed the request but made no code change.`,
      });
    }
  } finally {
    await ws.cleanup();
  }
}

/** Respond to an @mention with a contextual reply (read-only). */
export async function handleMention(
  deps: HandlerDeps,
  args: { owner: string; repo: string; issueNumber: number; question: string; defaultBranch: string },
): Promise<void> {
  const { octokit, client, token, log } = deps;
  const ws = await (deps.workspace ?? realWorkspace).clone({ owner: args.owner, repo: args.repo, ref: args.defaultBranch }, token);
  try {
    const repoMap = await buildRepoMap(ws.dir);
    const result = await runAgent({
      client,
      system: mentionSystemPrompt(),
      initialContent: [{ type: 'text', text: repoMap }, { type: 'text', text: args.question }],
      tools: reviewToolset(),
      limits: { maxIterations: MAX_ITER, maxOutputTokens: 4096 },
      cwd: ws.dir,
      onEvent: (e) => e.type === 'tool' && log(`tool: ${e.name}`),
    });
    await octokit.rest.issues.createComment({
      owner: args.owner,
      repo: args.repo,
      issue_number: args.issueNumber,
      body: result.finalText || `${DISPLAY} could not produce a response.`,
    });
  } finally {
    await ws.cleanup();
  }
}

function isFromForge(login: string | undefined): boolean {
  if (!login) return false;
  return /forge|\[bot\]/i.test(login);
}
