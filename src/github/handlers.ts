import type { LLMClient } from '../providers/types.js';
import { runAgent } from '../agent/loop.js';
import { editToolset, reviewToolset } from '../agent/tools/registry.js';
import { fixSystemPrompt, reviewSystemPrompt, mentionSystemPrompt } from '../agent/prompts.js';
import { detectTestCommand } from '../agent/tools/tests.js';
import { runCommand } from '../agent/tools/bash.js';
import { buildIssueContent, buildReviewContent, type CommentLike } from './context.js';
import { buildReviewPayload, parseFindings, parseDiffValidLines } from './review.js';
import {
  cloneRepo,
  createBranch,
  commitAll,
  pushBranch,
  type RepoRef,
} from './workspace.js';
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
  /** Optional explicit test command override (from .github/agent.yml). */
  testCommand?: string;
}

/** Fix an issue end-to-end: clone → investigate/edit → verify → open PR → comment. */
export async function handleIssueFix(
  deps: HandlerDeps,
  args: { owner: string; repo: string; defaultBranch: string; issueNumber: number; issueTitle: string; issueBody: string | null },
): Promise<void> {
  const { octokit, client, token, log } = deps;
  const repoRef: RepoRef = { owner: args.owner, repo: args.repo, ref: args.defaultBranch };
  const branch = `forge/issue-${args.issueNumber}`;

  const commentsRes = await octokit.rest.issues.listComments({ owner: args.owner, repo: args.repo, issue_number: args.issueNumber });
  const comments: CommentLike[] = commentsRes.data
    .filter((c) => c.body && !isFromForge(c.user?.login))
    .map((c) => ({ user: c.user?.login ?? 'user', body: c.body! }));

  const ws = await cloneRepo(repoRef, token);
  try {
    await createBranch(ws, branch);
    const initialContent = await buildIssueContent(
      { number: args.issueNumber, title: args.issueTitle, body: args.issueBody },
      comments,
      token,
      log,
    );

    const result = await runAgent({
      client,
      system: fixSystemPrompt(),
      initialContent,
      tools: editToolset({ testCommand: deps.testCommand }),
      limits: { maxIterations: MAX_ITER, maxOutputTokens: 8192 },
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

    const committed = await commitAll(ws, `fix: address issue #${args.issueNumber}\n\n${result.finalText}`.slice(0, 4000));
    if (!committed) {
      await octokit.rest.issues.createComment({
        owner: args.owner,
        repo: args.repo,
        issue_number: args.issueNumber,
        body: `🤔 ${DISPLAY} investigated but did not produce a code change.\n\n${result.finalText}`,
      });
      return;
    }
    await pushBranch(ws, branch);

    const pr = await openPullRequest(octokit, {
      owner: args.owner,
      repo: args.repo,
      title: `Fix: ${args.issueTitle}`.slice(0, 250),
      body: composeFixPrBody({ issueNumber: args.issueNumber, summary: result.finalText, testsPassed, testOutput: testOutput.slice(-4000) }),
      head: branch,
      base: args.defaultBranch,
      draft: testsPassed === false,
    });

    await octokit.rest.issues.createComment({
      owner: args.owner,
      repo: args.repo,
      issue_number: args.issueNumber,
      body: `🔧 ${DISPLAY} opened ${pr.url} with a proposed fix.`,
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

  const ws = await cloneRepo({ owner: args.owner, repo: args.repo, ref: prRes.data.head.ref }, token);
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

/** Respond to an @mention with a contextual reply (read-only). */
export async function handleMention(
  deps: HandlerDeps,
  args: { owner: string; repo: string; issueNumber: number; question: string; defaultBranch: string },
): Promise<void> {
  const { octokit, client, token, log } = deps;
  const ws = await cloneRepo({ owner: args.owner, repo: args.repo, ref: args.defaultBranch }, token);
  try {
    const result = await runAgent({
      client,
      system: mentionSystemPrompt(),
      initialContent: [{ type: 'text', text: args.question }],
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
