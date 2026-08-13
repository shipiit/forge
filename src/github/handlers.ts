import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { LLMClient, Usage } from '../providers/types.js';
import { estimateCost, formatCost, addUsage } from '../util/cost.js';
import { runAgent, DEFAULT_MAX_OUTPUT_TOKENS, type AgentEvent, type AgentLimits, type AgentResult } from '../agent/loop.js';
import type { RunTracker } from '../usage/track.js';
import { editToolset, reviewToolset, selectTools, type ToolSelection } from '../agent/tools/registry.js';
import type { Tool } from '../agent/tools/types.js';
import { applyExtraPrompt } from '../actionInputs.js';
import { orchestratorToolset } from '../agent/subagent.js';
import {
  fixSystemPrompt,
  reviewSystemPrompt,
  mentionSystemPrompt,
  analyzeSystemPrompt,
  auditSystemPrompt,
  ciFixSystemPrompt,
  historySystemPrompt,
  releaseNotesSystemPrompt,
} from '../agent/prompts.js';
import { detectTestCommand, detectInstallCommand } from '../agent/tools/tests.js';
import { runCommand } from '../agent/tools/bash.js';
import { buildRepoMap } from '../agent/repomap.js';
import { createWorkspaceScanner } from '../agent/tools/security.js';
import { applySkill, parseSkillInvocation, renderSkillList, resolveSkills, type Skill } from '../agent/skills.js';
import type { Routine } from '../routines.js';
import { loadRepoInstructions, renderProjectContextBlock, composeReviewSystemPrompt } from './conventions.js';
import { buildCheckRunRequest } from './checkrun.js';
import {
  REVIEW_THREADS_QUERY,
  RESOLVE_THREAD_MUTATION,
  parseThreads,
  planThreads,
  renderSkipped,
  type ThreadPlan,
} from './threads.js';
import {
  FINDING_LABEL,
  issueBody,
  issueTitle,
  labelsFor,
  rollupBody,
  rollupTitle,
  selectForIssues,
  trackedFingerprints,
  type FindingIssueMode,
} from './findingIssues.js';
import { NO_CAP, renderBudgetStop } from '../util/budget.js';
import {
  MemoryRateLimitStore,
  checkRateLimit,
  renderRateLimited,
  repoKey,
  type RateLimitStore,
} from '../util/rateLimit.js';
import {
  alreadyRecorded,
  insertHistoryEntry,
  parseHistoryPayload,
  renderHistoryEntry,
  renderHistoryFile,
  historyFilename,
  type HistoryEntry,
} from './history.js';
import { buildIssueContent, buildReviewContent, type CommentLike } from './context.js';
import {
  buildReviewPayload,
  parseFindings,
  parseDiffValidLines,
  parseDiffLineText,
  renderAuditReport,
  capNits,
  scopeFindingsToDiff,
  changedFiles,
  type ReviewFinding,
} from './review.js';
import { parseSarif } from './sarif.js';
import { redactSecrets } from '../util/resilience.js';
import { collectFiles, inTestFile, mergeFindings, runScanners, SCANNERS, type Scanner } from '../scan/index.js';
import { MAX_READ_CHARS } from '../agent/tools/fs.js';
import type { ContentPart } from '../providers/types.js';
import { blocking, renderReviewAck, renderReviewDone, renderScanReport, type BlockLevel } from '../scan/report.js';
import { fetchDependabotFindings } from './dependabot.js';
import { isSafeRef, realWorkspace, type RepoRef, type WorkspacePort } from './workspace.js';
import {
  composeFixPrBody,
  fetchPrDiff,
  openPullRequest,
  type OctokitLike,
} from './pr.js';

const MAX_ITER = Number(process.env.MAX_ITERATIONS || 25);
/** Output-token budget per model turn — one value for every flow (16k default). */
const MAX_TOKENS = DEFAULT_MAX_OUTPUT_TOKENS;
const DISPLAY = process.env.FORGE_DISPLAY_NAME || 'ShipIT Forge';
/** Applied to a PR by `review always`; makes the subscription durable and visible. */
export const REVIEW_ALWAYS_LABEL = 'forge:review-always';

export interface HandlerDeps {
  octokit: OctokitLike;
  client: LLMClient;
  token: string; // installation token for clone + image download
  log: (msg: string) => void;
  /** Run a self-review pass over the fix diff before opening the PR (default true). */
  selfReview?: boolean;
  /** Which deterministic scanners to run. Defaults to all of them. */
  scanners?: Scanner[];
  /** Lowest severity that fails the scan's check run. Defaults to high. */
  scanBlockOn?: BlockLevel;
  /** Optional explicit test command override (from .github/agent.yml). */
  testCommand?: string;
  /** Workspace operations; defaults to real git. Overridden in tests. */
  workspace?: WorkspacePort;
  /** Optional path (in the repo) to a SARIF file to ingest during review. */
  sarifPath?: string;
  /** Max low-severity inline comments per review; -1 disables the cap. */
  maxNits?: number;
  /** Extra instructions appended to every system prompt for this run. */
  extraPrompt?: string;
  /** Restrict which tools the agent is offered (fewer tools = fewer tokens). */
  toolSelection?: ToolSelection;
  /** Path of the change-history document, or its directory in per_commit mode. */
  historyPath?: string;
  /** `single` appends to one document; `per_commit` writes a file per change. */
  historyMode?: 'single' | 'per_commit';
  /** Skill to run for this invocation, when the workflow selected one. */
  skillName?: string;
  /** A skill defined in the workflow file rather than committed to the repo. */
  inlineSkill?: Skill;
  /** Extra directory to load committed skills from. */
  skillsPath?: string;
  /** USD ceiling for a single run. Infinity (the default) means no cap. */
  spendCapPerRunUsd?: number;
  /** Runs allowed per repository per hour. 0 or less means no limit. */
  maxRunsPerHour?: number;
  /** Where the rate-limit window lives. Defaults to a process-local store. */
  rateLimitStore?: RateLimitStore;
  /** Turn findings into issues: off, one rollup issue, or one issue each. */
  findingsToIssues?: FindingIssueMode;
  /** Findings below this severity never become issues. */
  findingsMinSeverity?: ReviewFinding['severity'];
  /** Ceiling on issues opened by a single run. */
  findingsMaxIssues?: number;
  /** Print the token/spend footer under comments (default true). */
  showCost?: boolean;
  /** Injectable clock, so tests never depend on wall time. */
  now?: () => number;
  /** Records what this run did. Absent means nothing is being recorded. */
  run?: RunTracker;
}

/** Process-local window, shared by every handler in this process. */
const defaultRateLimitStore = new MemoryRateLimitStore();

/** The limits every runAgent call in a handler should carry. */
/**
 * Wall-clock ceiling for one run.
 *
 * Fifteen minutes: several times the slowest healthy review measured, and well
 * under the point where somebody has stopped waiting and gone to look at
 * something else. A check that takes longer than that has stopped being a check
 * and become a thing people merge around.
 */
function deadlineMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.FORGE_RUN_DEADLINE_MS);
  if (!Number.isFinite(raw) || raw <= 0) return 900_000;
  return Math.min(Math.max(raw, 60_000), 6 * 3_600_000);
}

function limitsFor(deps: HandlerDeps, maxIterations = MAX_ITER): AgentLimits {
  return {
    maxIterations,
    maxOutputTokens: MAX_TOKENS,
    maxSpendUsd: deps.spendCapPerRunUsd ?? NO_CAP,
    maxWallClockMs: deadlineMs(),
  };
}

/**
 * Ask whether this repository may start another run, and consume capacity if so.
 *
 * Posts one comment when it declines, so a maintainer sees why nothing happened
 * rather than assuming the agent is broken. Returns true when the run may go on.
 */
async function allowRun(
  deps: HandlerDeps,
  owner: string,
  repo: string,
  issueNumber?: number,
): Promise<boolean> {
  const limit = deps.maxRunsPerHour ?? 0;
  if (!limit || limit <= 0) return true;

  const now = (deps.now ?? Date.now)();
  const decision = await checkRateLimit(
    deps.rateLimitStore ?? defaultRateLimitStore,
    repoKey(owner, repo),
    limit,
    now,
  );
  if (decision.allowed) return true;

  deps.log(`rate limit reached for ${owner}/${repo}: ${decision.used}/${decision.limit} in the last hour`);
  deps.run?.skip('rate limited');
  if (issueNumber) {
    try {
      await deps.octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body: renderRateLimited(decision, now),
      });
    } catch {
      /* the limit still applies even if we could not say so */
    }
  }
  return false;
}

/** Resolve every skill available to this run: built-ins, repo files, workflow-inline. */
function skillsFor(deps: HandlerDeps, cwd: string) {
  return resolveSkills(cwd, { extraDir: deps.skillsPath, inline: deps.inlineSkill });
}

/**
 * The event listener for one agent segment: records it when a run is being
 * tracked, and keeps whatever logging the call site already did either way.
 */
function watch(
  deps: HandlerDeps,
  phase = 'main',
  onEvent?: (e: AgentEvent) => void,
): ((e: AgentEvent) => void) | undefined {
  return deps.run ? deps.run.listen(phase, onEvent) : onEvent;
}

/**
 * The changed files, in full, as one block of content.
 *
 * Bounded twice over: each file at the same cap `read_file` uses, and the
 * whole block at four times that. A pull request that rewrites a lockfile
 * would otherwise put half a million characters into the first message and
 * resend them on every turn afterwards — the exact cost this exists to avoid.
 * Past the budget the remaining files are named rather than included, so the
 * agent knows to read them and knows they were not hidden from it.
 */
async function seedChangedFiles(
  cwd: string,
  diff: string,
  log: (m: string) => void,
): Promise<ContentPart | undefined> {
  const files = changedFiles(diff);
  if (files.length === 0) return undefined;

  const PER_FILE = MAX_READ_CHARS;
  const TOTAL = MAX_READ_CHARS * 4;
  const parts: string[] = [];
  const skipped: string[] = [];
  let used = 0;

  for (const rel of files) {
    if (used >= TOTAL) {
      skipped.push(rel);
      continue;
    }
    let text: string;
    try {
      text = await fs.readFile(path.join(cwd, rel), 'utf8');
    } catch {
      continue; // deleted by this change, or binary — the diff already says so
    }
    const room = Math.min(PER_FILE, TOTAL - used);
    const clipped = text.length > room ? `${text.slice(0, room)}\n… [truncated — use read_file with offset for the rest]` : text;
    used += clipped.length;
    parts.push(`--- ${rel} ---\n${clipped}`);
  }

  if (parts.length === 0) return undefined;
  log(`seeded ${parts.length} changed file(s) into the review context${skipped.length ? `, ${skipped.length} too large to include` : ''}`);

  const tail = skipped.length
    ? `\n\nNot included, over the budget — read them if you need to: ${skipped.join(', ')}`
    : '';
  return {
    type: 'text',
    text:
      `Full contents of the files this pull request changes, at the head commit. ` +
      `You already have these — do not read them again. Read other files only when a specific ` +
      `question about reachability needs answering.\n\n${parts.join('\n\n')}${tail}`,
  };
}

/**
 * Progress, one line per step.
 *
 * A run that prints nothing between "scanning" and "done" is indistinguishable
 * from one that has hung, and the person watching cannot tell which — so they
 * wait, or they cancel a job that was working. Observed on a real review: six
 * and a half minutes of silence on a provider that answers in two seconds a
 * turn. The model was fine; the log was the problem.
 *
 * Turn latency is the number that identifies where the time went. Twenty turns
 * at six seconds is a long review; one turn at four minutes is a sick endpoint.
 * They are the same wall-clock and completely different problems.
 */
function progress(log: (m: string) => void): (e: AgentEvent) => void {
  return (e) => {
    if (e.type === 'tool') log(`tool: ${e.name}`);
    else if (e.type === 'deadline') {
      log(
        `stopped at the ${Math.round(e.elapsedMs / 60_000)} minute deadline after ${e.iterations} turn(s) — ` +
          `reporting what was found. Raise FORGE_RUN_DEADLINE_MS if this repository needs longer.`,
      );
    } else if (e.type === 'turn') {
      const secs = (e.latencyMs / 1000).toFixed(1);
      const cached = e.usage.cacheReadTokens ? `, ${e.usage.cacheReadTokens} cached` : '';
      log(
        `turn ${e.idx}: ${secs}s · ${e.usage.inputTokens} in${cached} / ${e.usage.outputTokens} out · ${e.stopReason}`,
      );
    }
  };
}

/** Apply the run's tool allow/deny selection to a toolset. */
function pick(deps: HandlerDeps, tools: Tool[]): Tool[] {
  return selectTools(tools, deps.toolSelection ?? {});
}

/** How many scanner findings to name before the list stops being useful. */
const SCAN_SUMMARY_LIMIT = 40;

/**
 * The scan, as one turn of context for the model.
 *
 * Two things this deliberately does not do. It sends each finding's title and
 * location and never its body: a secret finding's body quotes the first
 * characters of what it matched, and there is no reason to put that in a prompt
 * when the title already says what was found. It is redacted anyway — a scanner
 * added later might put matched text in a title, and this should not be the
 * place that discovers it.
 *
 * And it is capped. A repository with a thousand findings would otherwise turn
 * the first turn of every review into a wall of list items, paid for by token.
 */
export function scanSummary(findings: ReviewFinding[]): { type: 'text'; text: string } {
  const shown = findings.slice(0, SCAN_SUMMARY_LIMIT);
  const rest = findings.length - shown.length;
  const lines = shown.map((f) => `- ${f.file}:${f.endLine} ${f.severity} ${f.category} — ${f.title}`);
  if (rest > 0) lines.push(`- …and ${rest} more of the same kind.`);

  return {
    type: 'text',
    text: redactSecrets(
      'A deterministic scan of the changed files already found these. Do not repeat them; ' +
        `judge whether each is reachable and say so only if you disagree:\n${lines.join('\n')}`,
    ),
  };
}

/**
 * Apply a workflow-selected skill to a system prompt.
 *
 * `skill:` was only ever read by the mention and routine flows, so a workflow
 * that set it on a review or an issue analysis looked configured and changed
 * nothing. Returns the prompt untouched when no skill is selected or the name
 * does not resolve.
 */
async function withSkill(deps: HandlerDeps, cwd: string, system: string, task = ''): Promise<string> {
  if (!deps.skillName && !deps.inlineSkill) return system;
  const skills = await skillsFor(deps, cwd);
  const skill = deps.skillName ? skills.get(deps.skillName.toLowerCase()) : deps.inlineSkill;
  if (!skill) {
    deps.log(`no skill named "${deps.skillName}" — continuing with the default prompt`);
    return system;
  }
  return applySkill(system, skill, task);
}

/** Apply the run's extra instructions to a system prompt. */
function prompt(deps: HandlerDeps, base: string): string {
  return applyExtraPrompt(base, deps.extraPrompt);
}

/** Prevent duplicate concurrent runs for the same target (multiple triggers + smee re-delivery + spam). */
const inFlight = new Set<string>();

/** Run `fn` only if no run with the same key is in flight; otherwise skip (dedup). */
async function withLock(key: string, log: (m: string) => void, fn: () => Promise<void>): Promise<void> {
  if (inFlight.has(key)) {
    log(`Duplicate trigger (${key}); already running, skipping.`);
    return;
  }
  inFlight.add(key);
  try {
    await fn();
  } finally {
    inFlight.delete(key);
  }
}

/**
 * A one-line run-cost footer for a comment or PR body. Previously cost was only
 * ever shown by the CLI, so the flows that actually spend money reported nothing.
 */
/**
 * The token/spend line under a comment.
 *
 * Off by default on a public repository is the wrong call — but so is printing
 * what a team spends under every comment on one. `show_cost` in agent.yml, or
 * FORGE_SHOW_COST=0, hides it; the run is still recorded either way, so the
 * number is not lost, only unpublished.
 */
export function costFooter(usage: Usage, model: string, show = false): string {
  if (!show) return '';
  const c = estimateCost(usage, model);
  if (c.inputTokens === 0 && c.outputTokens === 0) return '';
  return `\n\n<sub>🧮 ${formatCost(c)} · model \`${model}\`</sub>`;
}

/**
 * Prefix a result with the spend-cap notice when the run stopped early.
 *
 * Without this, a truncated run reads as a confident, complete answer — which is
 * the worst possible failure mode for something that writes code reviews.
 */
export function withBudgetNotice(result: AgentResult, model: string, body: string): string {
  if (result.stoppedBy !== 'budget' || !result.budget) return body;
  return `${renderBudgetStop(result.budget, model)}\n\n---\n\n${body}`;
}

/**
 * File issues for findings worth tracking.
 *
 * Skips anything an open issue already carries, so running an audit weekly does
 * not refile the same problems every week — the fastest way to make the feature
 * hated and switched off. Never throws: failing to open an issue must not lose
 * the report that was already posted.
 */
async function fileFindingIssues(
  deps: HandlerDeps,
  args: { owner: string; repo: string; date: string; sourceUrl?: string },
  findings: ReviewFinding[],
): Promise<string> {
  const mode = deps.findingsToIssues ?? 'off';
  if (mode === 'off' || findings.length === 0) return '';
  if (!deps.octokit.rest.issues.create) return '';

  try {
    // What is already tracked? Best effort — if we cannot tell, we would rather
    // file nothing than file duplicates.
    let tracked = new Set<string>();
    try {
      const open = await deps.octokit.rest.issues.listForRepo?.({
        owner: args.owner,
        repo: args.repo,
        state: 'open',
        labels: FINDING_LABEL,
        per_page: 100,
      });
      tracked = trackedFingerprints((open?.data ?? []).map((i) => i.body ?? ''));
    } catch (err) {
      deps.log(`could not read existing finding issues, skipping issue creation: ${(err as Error).message}`);
      return '';
    }

    const selection = selectForIssues(findings, {
      minSeverity: deps.findingsMinSeverity ?? 'high',
      tracked,
      maxIssues: deps.findingsMaxIssues ?? 10,
    });
    if (selection.selected.length === 0) {
      deps.log(`no new findings to file (${selection.duplicates} already tracked)`);
      return selection.duplicates ? `\n\n<sub>All findings above the severity floor are already tracked.</sub>` : '';
    }

    const opened: string[] = [];
    if (mode === 'rollup') {
      const res = await deps.octokit.rest.issues.create({
        owner: args.owner,
        repo: args.repo,
        title: rollupTitle(DISPLAY, args.date, selection.selected.length),
        body: rollupBody(selection.selected, { displayName: DISPLAY, sourceUrl: args.sourceUrl, selection }),
        labels: [FINDING_LABEL],
      });
      opened.push(res.data.html_url);
      deps.run?.output('issue', {
        ref: String(res.data.number),
        url: res.data.html_url,
        title: rollupTitle(DISPLAY, args.date, selection.selected.length),
      });
    } else {
      for (const f of selection.selected) {
        const res = await deps.octokit.rest.issues.create({
          owner: args.owner,
          repo: args.repo,
          title: issueTitle(f, DISPLAY),
          body: issueBody(f, { displayName: DISPLAY, sourceUrl: args.sourceUrl }),
          labels: labelsFor(f),
        });
        opened.push(res.data.html_url);
        deps.run?.output('issue', { ref: String(res.data.number), url: res.data.html_url, title: issueTitle(f, DISPLAY) });
      }
    }

    deps.log(`filed ${opened.length} issue(s) for findings`);
    const list = opened.map((u) => `- ${u}`).join('\n');
    return `\n\n**Tracked as ${opened.length === 1 ? 'an issue' : 'issues'}**\n${list}`;
  } catch (err) {
    deps.log(`could not file finding issues: ${(err as Error).message}`);
    return '';
  }
}

/**
 * Reconcile this review against what is already on the pull request.
 *
 * Skips findings already commented, and resolves threads whose finding is gone.
 * Needs GraphQL — `resolveReviewThread` has no REST equivalent — so it degrades
 * to "post everything" wherever GraphQL is unavailable rather than failing the
 * review outright.
 */
async function reconcileThreads(
  deps: HandlerDeps,
  args: { owner: string; repo: string; pullNumber: number },
  findings: ReviewFinding[],
): Promise<ThreadPlan> {
  const fallback: ThreadPlan = { toPost: findings, alreadyPosted: [], toResolve: [] };
  const graphql = deps.octokit.graphql;
  if (!graphql) return fallback;

  try {
    const res = await graphql(REVIEW_THREADS_QUERY, {
      owner: args.owner,
      repo: args.repo,
      number: args.pullNumber,
    });
    const existing = parseThreads(res as never, (login) => isFromForge(login));
    const plan = planThreads(findings, existing);

    for (const threadId of plan.toResolve) {
      try {
        await graphql(RESOLVE_THREAD_MUTATION, { threadId });
      } catch (err) {
        deps.log(`could not resolve a thread: ${(err as Error).message}`);
      }
    }
    if (plan.toResolve.length) deps.log(`resolved ${plan.toResolve.length} thread(s) whose finding is fixed`);
    if (plan.alreadyPosted.length) deps.log(`skipped ${plan.alreadyPosted.length} finding(s) already commented`);
    return plan;
  } catch (err) {
    deps.log(`thread reconciliation unavailable: ${(err as Error).message}`);
    return fallback;
  }
}

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
  return s || '_(no summary produced)_';
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
    if (!(await allowRun(deps, args.owner, args.repo, args.issueNumber))) return;
    const commentsRes = await octokit.rest.issues.listComments({ owner: args.owner, repo: args.repo, issue_number: args.issueNumber });
    const comments: CommentLike[] = commentsRes.data
      .filter((c) => c.body && !isFromForge(c.user?.login))
      .map((c) => ({ user: c.user?.login ?? 'user', body: c.body! }));

    // Acknowledge immediately, then edit THIS comment in place with the result (no spam).
    const ack = await octokit.rest.issues.createComment({
      owner: args.owner,
      repo: args.repo,
      issue_number: args.issueNumber,
      body: `👀 **${DISPLAY}** is analyzing issue #${args.issueNumber}… I'll update this comment with my findings shortly.`,
    });

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
        system: await withSkill(deps, ws.dir, prompt(deps, analyzeSystemPrompt()), args.issueTitle),
        initialContent,
        tools: pick(deps, reviewToolset()), // read-only: no edits
        limits: limitsFor(deps),
        cwd: ws.dir,
        onEvent: watch(deps, 'main', progress(log)),
      });
      deps.run?.add(result);

      await octokit.rest.issues.updateComment({
        owner: args.owner,
        repo: args.repo,
        comment_id: ack.data.id,
        body:
          `### 🔍 ${DISPLAY} — analysis of #${args.issueNumber}\n\n` +
          `${cleanSummary(result.finalText, 4000)}\n\n` +
          `---\n_Want me to implement this and open a PR — with an automated **security + code review** and tests run on the change? Comment **\`/fix\`** and I'll do it._` +
          costFooter(result.usage, client.model, deps.showCost),
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

  if (!(await allowRun(deps, args.owner, args.repo, args.issueNumber))) return;

  // Idempotency: if a fix PR for this issue is already open, do nothing.
  const existing = await octokit.rest.pulls.list({
    owner: args.owner,
    repo: args.repo,
    head: `${args.owner}:${branch}`,
    state: 'open',
  });
  if (existing.data.length > 0) {
    log(`fix PR already open for issue #${args.issueNumber} (${existing.data[0]!.html_url}); skipping.`);
    deps.run?.skip('a fix PR is already open');
    return;
  }

  // Acknowledge immediately, then edit THIS comment in place with the result.
  const ack = await octokit.rest.issues.createComment({
    owner: args.owner,
    repo: args.repo,
    issue_number: args.issueNumber,
    body: `🛠️ **${DISPLAY}** is working on a fix for #${args.issueNumber} — investigating, editing, running tests, and opening a PR. I'll update this comment when done.`,
  });

  const commentsRes = await octokit.rest.issues.listComments({ owner: args.owner, repo: args.repo, issue_number: args.issueNumber });
  const comments: CommentLike[] = commentsRes.data
    .filter((c) => c.body && !isFromForge(c.user?.login))
    .map((c) => ({ user: c.user?.login ?? 'user', body: c.body! }));

  const ws = await wsOps.clone(repoRef, token);
  try {
    await wsOps.createBranch(ws, branch);

    // Install dependencies once (best-effort) so the agent's run_tests works in a fresh clone.
    const installCmd = await detectInstallCommand(ws.dir);
    if (installCmd) {
      log(`installing dependencies: ${installCmd}`);
      await runCommand(installCmd, { cwd: ws.dir, supportsVision: client.supportsVision }, { timeoutMs: 300_000 });
    }

    const repoMap = await buildRepoMap(ws.dir);
    const instructions = await loadRepoInstructions(ws.dir);
    if (instructions.found.length) log(`repo instructions: ${instructions.found.join(', ')}`);
    const initialContent = await buildIssueContent(
      { number: args.issueNumber, title: args.issueTitle, body: args.issueBody },
      comments,
      token,
      log,
    );
    const conventions = renderProjectContextBlock(instructions);
    if (conventions) initialContent.unshift({ type: 'text', text: conventions });
    initialContent.unshift({ type: 'text', text: repoMap });

    const fixLimits = limitsFor(deps);
    const result = await runAgent({
      client,
      system: prompt(deps, fixSystemPrompt()),
      initialContent,
      // Orchestrator toolset: edit tools + spawn_subagent so big fixes can be split up.
      tools: orchestratorToolset({
        client,
        limits: fixLimits,
        depth: 0,
        maxDepth: 2,
        testCommand: deps.testCommand,
        segment: (label) => watch(deps, label),
      }),
      limits: fixLimits,
      cwd: ws.dir,
      security: await createWorkspaceScanner(ws.dir),
      // The flows whose job is to change something: ending without having
      // used one of these is a stop, not a finish.
      actionTools: ['write_file', 'edit_file', 'multi_edit', 'apply_patch'],
      onEvent: watch(deps, 'main', progress(log)),
    });
    deps.run?.add(result);

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
    if (committed) deps.run?.output('commit', { ref: branch, title: `fix: ${args.issueTitle}`.slice(0, 200) });
    if (!committed) {
      await octokit.rest.issues.updateComment({
        owner: args.owner,
        repo: args.repo,
        comment_id: ack.data.id,
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
    // A fix run is several conversations (main + subagents + self-review); bill them together.
    let totalUsage: Usage = result.usage;
    if (deps.selfReview && diff.trim()) {
      const reviewRes = await runAgent({
        client,
        system: reviewSystemPrompt(),
        initialContent: [{ type: 'text', text: `Review your own change before it becomes a PR. Be strict about correctness and regressions.\n\nIssue: ${args.issueTitle}\n\nDiff:\n\`\`\`diff\n${diff}\n\`\`\`` }],
        tools: pick(deps, reviewToolset()),
        limits: limitsFor(deps),
        cwd: ws.dir,
        onEvent: watch(deps, 'self_review', progress(log)),
      });
      deps.run?.add(reviewRes);
      totalUsage = addUsage(totalUsage, reviewRes.usage);
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
    deps.run?.output('pull_request', { url: pr.url, title: `Fix: ${args.issueTitle}`.slice(0, 250) });

    // Update the ack comment in place — root cause + reasoning, files, verification, PR link.
    await octokit.rest.issues.updateComment({
      owner: args.owner,
      repo: args.repo,
      comment_id: ack.data.id,
      body:
        `### 🔧 ${DISPLAY} — fix ready in ${pr.url}\n\n` +
        `**What I found & changed**\n\n${summary}\n\n` +
        `**Files changed**\n${filesBlock}\n\n` +
        `**Verification**\n${verify}\n\n` +
        `Review and merge ${pr.url} to apply the fix.` +
        (selfReviewNote ? `\n${selfReviewNote}` : '') +
        costFooter(totalUsage, client.model, deps.showCost),
    });
  } finally {
    await ws.cleanup();
  }
}

/** Review a PR: clone head → analyze diff → post a review with inline findings. */
export function handlePrReview(
  deps: HandlerDeps,
  args: { owner: string; repo: string; pullNumber: number; securityOnly?: boolean; subscribe?: boolean },
): Promise<void> {
  return withLock(`review:${args.owner}/${args.repo}#${args.pullNumber}`, deps.log, () => doPrReview(deps, args));
}

async function doPrReview(
  deps: HandlerDeps,
  args: { owner: string; repo: string; pullNumber: number; securityOnly?: boolean; subscribe?: boolean },
): Promise<void> {
  const { octokit, client, token, log } = deps;

  // Acknowledge first (like the issue/fix flows), then post the formal review and
  // update this comment with a one-line verdict.
  if (!(await allowRun(deps, args.owner, args.repo, args.pullNumber))) return;

  // "review always" subscribes this PR to push-triggered re-review. Forge is
  // stateless, so the subscription lives on the PR itself as a label — durable,
  // visible to the team, and free.
  if (args.subscribe) {
    try {
      await octokit.rest.issues.addLabels?.({
        owner: args.owner,
        repo: args.repo,
        issue_number: args.pullNumber,
        labels: [REVIEW_ALWAYS_LABEL],
      });
      log(`subscribed #${args.pullNumber} to push-triggered reviews`);
    } catch (err) {
      log(`could not add the subscription label: ${(err as Error).message}`);
    }
  }

  const ackBody = `${renderReviewAck(
    DISPLAY,
    (deps.scanners ?? SCANNERS).map((sc) => sc.name),
    args.securityOnly,
  )}\n\n<!-- forge-review -->`;

  // Reuse the previous run's comment rather than adding another.
  //
  // This is posted before the model runs and rewritten with the result after,
  // so on every push it left one more "reviewing this pull request" behind.
  // Three runs, three of them, and the finished review buried above the two
  // that never finished. The scan report already worked this way; the ack was
  // the one that got missed.
  const previous = await findForgeComment(octokit, args, '<!-- forge-review -->');
  let ackId = previous;
  if (previous) {
    await octokit.rest.issues.updateComment({
      owner: args.owner,
      repo: args.repo,
      comment_id: previous,
      body: ackBody,
    });
  } else {
    const created = await octokit.rest.issues.createComment({
      owner: args.owner,
      repo: args.repo,
      issue_number: args.pullNumber,
      body: ackBody,
    });
    ackId = created.data.id;
  }

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
    const instructions = await loadRepoInstructions(ws.dir);
    if (instructions.found.length) log(`repo instructions: ${instructions.found.join(', ')}`);

    // Scan before the model, not after. Two reasons: the deterministic pass
    // costs nothing, so a review that stops early for budget still carries the
    // findings that were free; and the model is told what was already found,
    // so it spends its turns judging whether those are reachable rather than
    // rediscovering a key it would have read past anyway.
    const all = await runScanners({ cwd: ws.dir, only: new Set(parseDiffValidLines(diff).keys()) }, deps.scanners);

    // A finding in a test file does not become an inline review comment.
    //
    // A suite has to contain what it detects — the scanner's own cases are a
    // command injection, a traversal and a key, all written deliberately — and
    // a pull request that introduced no weakness should not arrive carrying
    // eight nits about its own fixtures. They are still reported, at low
    // severity, in the scan comment: a credential pasted into a test is still
    // a credential, and quietly dropping it is how one stays there.
    const scanned = all.filter((f) => !inTestFile(f));
    const inTests = all.length - scanned.length;
    if (scanned.length) log(`scanners: ${scanned.length} finding(s) before the model ran`);
    if (inTests) log(`scanners: ${inTests} finding(s) in test files, reported but not commented on`);

    // Hand over the changed files whole, before the first turn.
    //
    // A diff is a set of hunks with three lines of context, so the first thing
    // any reviewer does is read the files to see what the hunks sit in. Left to
    // do that itself the agent spends its opening turns on read_file and
    // list_dir — five reads and a directory listing on a two-file change,
    // measured — and each one costs a round trip and is resent on every turn
    // afterwards. Handing them over costs the same tokens once instead of
    // repeatedly, and removes the turns entirely.
    //
    // Only the changed files. Reading a caller to judge whether a sink is
    // reachable is still allowed and still worth a turn; orienting is not.
    const seeded = await seedChangedFiles(ws.dir, diff, log);
    const content = [...initialContent, ...(seeded ? [seeded] : [])];

    const result = await runAgent({
      client,
      // REVIEW.md overrides the default guidance; FORGE.md is context whose
      // newly-introduced violations are nits.
      system: await withSkill(
        deps,
        ws.dir,
        prompt(deps, composeReviewSystemPrompt(reviewSystemPrompt({ securityOnly: args.securityOnly }), instructions)),
      ),
      initialContent: scanned.length ? [...content, scanSummary(scanned)] : content,
      tools: pick(deps, reviewToolset()),
      limits: limitsFor(deps),
      cwd: ws.dir,
      onEvent: watch(deps, 'main', progress(log)),
    });
    deps.run?.add(result);

    // Hard-enforce the scope: the prompt asks for changed files only, this
    // guarantees it even if the model wanders.
    const findings = scopeFindingsToDiff(
      mergeFindings(parseFindings(result.finalText), scanned),
      diff,
    );
    deps.run?.findings(findings);
    deps.run?.artifact('diff', diff);

    // Merge live Dependabot alerts (current CVEs from GitHub's Advisory Database).
    findings.push(...(await fetchDependabotFindings(octokit, args.owner, args.repo, log)));

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

    // Post the check run FIRST: it is the durable record. Inline comments are
    // lossy (GitHub rejects any line outside the diff), so if the review call
    // fails the findings still survive here.
    try {
      const req = buildCheckRunRequest(args.owner, args.repo, prRes.data.head.sha, findings);
      await octokit.rest.checks.create?.(req as unknown as Record<string, unknown>);
    } catch (err) {
      log(`check run not posted: ${(err as Error).message}`);
    }

    // Do not repeat what is already on the PR, and resolve what is now fixed.
    const plan = await reconcileThreads(deps, args, findings);

    const { kept, dropped } = capNits(plan.toPost, deps.maxNits ?? 5);
    const validLines = parseDiffValidLines(diff);
    const payload = buildReviewPayload(kept, {
      displayName: DISPLAY,
      securityOnly: args.securityOnly,
      validLines,
      lineText: parseDiffLineText(diff),
      droppedNits: dropped,
      // A finding outside the diff cannot be an inline comment, so it needs a
      // link to the line it is about.
      repoUrl: `https://github.com/${args.owner}/${args.repo}`,
      ref: prRes.data.head.ref,
    });
    await octokit.rest.pulls.createReview({
      owner: args.owner,
      repo: args.repo,
      pull_number: args.pullNumber,
      event: payload.event,
      body: payload.body,
      comments: payload.comments,
    });

    // Update the ack comment with a one-line verdict pointing to the review.
    const verdict = payload.event === 'REQUEST_CHANGES' ? '🔴 requested changes' : '💬 commented (no blocking issues)';
    const sec = findings.filter((f) => f.lens === 'security').length;
    await octokit.rest.issues.updateComment({
      owner: args.owner,
      repo: args.repo,
      comment_id: ackId!,
      body:
        // Appended, not replaced. What was about to run is worth keeping next
        // to what it found — overwriting it means the only record of what was
        // looked for disappears the moment there is an answer, which is
        // exactly when somebody wants to know.
        `<!-- forge-review -->\n\n${renderReviewAck(
          DISPLAY,
          (deps.scanners ?? SCANNERS).map((sc) => sc.name),
          args.securityOnly,
          true,
        )}\n\n---\n\n` +
          withBudgetNotice(
            result,
            client.model,
            renderReviewDone({
              displayName: DISPLAY,
              verdict,
              total: findings.length,
              security: sec,
              scanners: (deps.scanners ?? SCANNERS).map((sc) => sc.name),
              fromScanners: scanned.length,
              inTestFiles: inTests,
              includeCoverage: false,
            }) + renderSkipped(plan),
          ) +
          costFooter(result.usage, client.model, deps.showCost),
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
export function handlePrFollowup(
  deps: HandlerDeps,
  args: { owner: string; repo: string; pullNumber: number; question: string },
): Promise<void> {
  return withLock(`followup:${args.owner}/${args.repo}#${args.pullNumber}`, deps.log, () => doPrFollowup(deps, args));
}

async function doPrFollowup(
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
      system: prompt(deps, mentionSystemPrompt()),
      initialContent: [
        { type: 'text', text: repoMap },
        { type: 'text', text: `You are working on the branch of PR #${args.pullNumber}. Request:\n\n${args.question}\n\nIf code changes are needed, make them and verify with tests.` },
      ],
      tools: pick(deps, editToolset({ testCommand: deps.testCommand })),
      limits: limitsFor(deps),
      cwd: ws.dir,
      onEvent: watch(deps, 'main', progress(log)),
    });
    deps.run?.add(result);

    const committed = await wsOps.commitAll(ws, `forge: ${args.question}`.slice(0, 200) + `\n\n${result.finalText}`.slice(0, 3000));
    if (committed) deps.run?.output('commit', { title: `forge: ${args.question}`.slice(0, 200) });
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
export function handleMention(
  deps: HandlerDeps,
  args: {
    owner: string;
    repo: string;
    issueNumber: number;
    question: string;
    defaultBranch: string;
    /** A skill chosen by the command, e.g. /help selecting how-to. */
    skill?: string;
    /** The thread's own text. Without it the agent is answering blind. */
    issueTitle?: string;
    issueBody?: string | null;
  },
): Promise<void> {
  return withLock(`mention:${args.owner}/${args.repo}#${args.issueNumber}`, deps.log, () => doMention(deps, args));
}

async function doMention(
  deps: HandlerDeps,
  args: {
    owner: string;
    repo: string;
    issueNumber: number;
    question: string;
    defaultBranch: string;
    /** A skill chosen by the command, e.g. /help selecting how-to. */
    skill?: string;
    /** The thread's own text. Without it the agent is answering blind. */
    issueTitle?: string;
    issueBody?: string | null;
  },
): Promise<void> {
  const { octokit, client, token, log } = deps;
  const ws = await (deps.workspace ?? realWorkspace).clone({ owner: args.owner, repo: args.repo, ref: args.defaultBranch }, token);
  try {
    const repoMap = await buildRepoMap(ws.dir);

    // `/skill-name …` runs a named prompt pack — built-in, or one the repo
    // committed under .forge/skills/.
    const invocation = parseSkillInvocation(args.question);
    const skills = await skillsFor(deps, ws.dir);
    // A workflow-selected skill applies when the comment didn't name one.
    // A command that picked a skill (/help) wins over the workflow default,
    // and an explicit /skill-name in the comment wins over both.
    const wanted = invocation?.name ?? args.skill ?? deps.skillName;
    const skill = wanted ? skills.get(wanted.toLowerCase()) : undefined;
    if (invocation && !skill) {
      await octokit.rest.issues.createComment({
        owner: args.owner,
        repo: args.repo,
        issue_number: args.issueNumber,
        body: `No skill named \`/${invocation.name}\`. Available skills:\n\n${renderSkillList(skills)}`,
      });
      return;
    }
    const system = skill
      ? applySkill(prompt(deps, mentionSystemPrompt()), skill, invocation?.args ?? '')
      : prompt(deps, mentionSystemPrompt());

    const result = await runAgent({
      client,
      system,
      initialContent: [
        { type: 'text', text: repoMap },
        // The agent has no tool for reading the issue it was mentioned on, so
        // without this it answers "I need more information" to a question
        // about a thread sitting right in front of the person who asked.
        ...(args.issueTitle || args.issueBody
          ? [
              {
                type: 'text' as const,
                text: `The thread you were called into — issue #${args.issueNumber}: ${args.issueTitle ?? ''}\n\n${args.issueBody ?? '(no description)'}`,
              },
            ]
          : []),
        { type: 'text', text: args.question },
      ],
      tools: pick(deps, selectTools(reviewToolset(), { allowed: skill?.tools ?? [] })),
      limits: limitsFor(deps),
      cwd: ws.dir,
      onEvent: watch(deps, 'main', progress(log)),
    });
    deps.run?.add(result);
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

/** Full-repository security audit (read-only) → one grouped report comment. */
/**
 * Scan for committed credentials and misconfiguration, and report.
 *
 * No model call at any point, which is the feature: it is instant, it is free,
 * and it gives the same answer twice. Runs on demand with `/secrets`, and
 * before a merge when the repository asks for it.
 */
export function handleScan(
  deps: HandlerDeps,
  args: { owner: string; repo: string; issueNumber: number; ref: string; pullNumber?: number },
): Promise<void> {
  return withLock(`scan:${args.owner}/${args.repo}#${args.issueNumber}`, deps.log, () => doScan(deps, args));
}

/**
 * The findings that sit in files this pull request changed.
 *
 * Asked of the API rather than derived from a diff, because the scan works
 * from a clone and never had the diff in hand. A renamed or deleted file comes
 * back too; a finding cannot be in one, so the extra names cost nothing.
 *
 * When the touched set cannot be established — an Octokit surface without
 * `listFiles`, a permission the workflow was not granted, a network failure —
 * every finding is returned. That keeps the gate exactly as strict as it was
 * before this scoping existed. Guessing "nothing was touched" would turn one
 * failed API call into a green check on a pull request that adds a credential,
 * and a gate that fails open is worse than no gate.
 */
async function touchedPaths(
  deps: HandlerDeps,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<Set<string> | undefined> {
  const list = deps.octokit.rest.pulls?.listFiles;
  if (!list) return undefined;
  try {
    // Paginated: a large pull request past the first page would otherwise look
    // as though it touched nothing beyond file 30.
    const pages = await deps.octokit.paginate?.<{ filename: string }>(list, {
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100,
    });
    const files: { filename: string }[] =
      pages ?? (await list({ owner, repo, pull_number: pullNumber, per_page: 100 })).data;
    const touched = new Set(files.map((f) => f.filename.replace(/^\.\//, '')));
    // An empty pull request is not a reason to scan nothing in particular; let
    // it fall through to the whole tree rather than report a vacuous success.
    return touched.size > 0 ? touched : undefined;
  } catch (err) {
    deps.log(
      `scan: could not read the changed files (${err instanceof Error ? err.message : 'unknown'}); scanning the whole tree`,
    );
    return undefined;
  }
}

async function doScan(
  deps: HandlerDeps,
  args: { owner: string; repo: string; issueNumber: number; ref: string; pullNumber?: number },
): Promise<void> {
  const { octokit, token, log } = deps;
  const wsOps = deps.workspace ?? realWorkspace;
  const ws = await wsOps.clone({ owner: args.owner, repo: args.repo, ref: args.ref }, token);

  try {
    // A pull-request review scans the change; an audit scans everything.
    //
    // Reviewing a change against the whole repository reports the same
    // historic findings on every pull request anyone opens. The author reads a
    // list dominated by files they have never touched, concludes the tool is
    // talking about somebody else's problem, and stops reading — which costs
    // more than the historic findings were ever worth surfacing this way.
    //
    // The whole tree still gets scanned: on demand with `/secrets`, and on a
    // schedule. That is where a credential committed last year belongs, in a
    // report somebody reads once and acts on, rather than as noise attached to
    // an unrelated change.
    //
    // When the changed files cannot be established, this falls back to the
    // whole tree — the same failure direction as the gate. Scanning too much
    // is noise; scanning nothing is a green check that means nothing.
    const changed = args.pullNumber
      ? await touchedPaths(deps, args.owner, args.repo, args.pullNumber)
      : undefined;

    const files = await collectFiles(ws.dir, changed);
    const findings = await runScanners({ cwd: ws.dir, only: changed }, deps.scanners);
    deps.run?.findings(findings);
    log(
      `scan: ${findings.length} finding(s) across ${files.length} ${changed ? 'changed file(s)' : 'file(s)'}`,
    );

    const body = renderScanReport(findings, {
      displayName: DISPLAY,
      scope: changed ? 'the files this pull request changes' : 'the repository',
      filesScanned: files.length,
      repoUrl: `https://github.com/${args.owner}/${args.repo}`,
      ref: args.ref,
      scanners: (deps.scanners ?? SCANNERS).map((sc) => sc.name),
      blockAt: deps.scanBlockOn ?? 'high',
    });

    // One comment per pull request, rewritten in place.
    //
    // The scan runs on every push, and a scanner that leaves a fresh report
    // under every push is one people collapse and stop reading by the third
    // one. The marker is how the next run finds what this one wrote; editing
    // also means the report always describes the current head rather than
    // being surrounded by four stale versions of itself.
    const marked = `${body}\n\n<!-- forge-scan -->`;
    const existing = await findScanComment(octokit, args);
    const posted = existing
      ? await octokit.rest.issues.updateComment({
          owner: args.owner,
          repo: args.repo,
          comment_id: existing,
          body: marked,
        })
      : await octokit.rest.issues.createComment({
          owner: args.owner,
          repo: args.repo,
          issue_number: args.issueNumber,
          body: marked,
        });
    // updateComment is typed loosely on the narrow Octokit surface the tests
    // stub, so the URL is read defensively rather than asserted.
    const url = (posted as { data?: { html_url?: string } } | undefined)?.data?.html_url;
    if (url) deps.run?.output('comment', { url, title: 'security scan' });

    // A check run is what actually stops a merge, once it is required. Neutral
    // rather than failing when nothing blocks, so a clean scan never nags.
    //
    // The scan reads the whole tree, and the report says so — a credential
    // committed last year is still leaked, and hiding it because today's diff
    // did not touch it would be the wrong report. The gate is a different
    // question: it asks whether *this* change may merge. Scoping it to the
    // files the pull request touched is what makes enabling the scanner
    // survivable. Whole-tree blocking means the first pull request after
    // switching it on cannot merge until somebody clears every historic
    // finding, and what people do at that point is turn the scanner off.
    //
    // The rest still appear in the comment, under their own heading, so the
    // debt stays visible without holding a README change hostage.
    if (args.pullNumber && octokit.rest.checks?.create) {
      try {
        const pr = await octokit.rest.pulls.get({ owner: args.owner, repo: args.repo, pull_number: args.pullNumber });
        const stop = blocking(findings, deps.scanBlockOn ?? 'high');
        await octokit.rest.checks.create({
          owner: args.owner,
          repo: args.repo,
          head_sha: pr.data.head.sha,
          name: `${DISPLAY} — security scan`,
          status: 'completed',
          conclusion: stop.length ? 'failure' : 'success',
          output: {
            title: stop.length
              ? `${stop.length} finding(s) in the files this pull request changed`
              : changed
                ? `Nothing found in the ${files.length} file(s) this pull request changes`
                : 'No credentials, misconfiguration or code findings',
            summary: body.slice(0, 60_000),
          },
        });
      } catch (err) {
        // A check run needs a permission the workflow may not have been given.
        log(`scan: could not publish a check run (${err instanceof Error ? err.message : 'unknown'})`);
      }
    }
  } finally {
    await ws.cleanup();
  }
}

/**
 * The comment a previous scan left on this pull request, if there is one.
 *
 * Never throws: not being able to list comments is a reason to post a new one,
 * not a reason to lose the report.
 */
async function findForgeComment(
  octokit: HandlerDeps['octokit'],
  args: { owner?: string; repo?: string; issueNumber?: number; pullNumber?: number } & Record<string, unknown>,
  marker: string,
): Promise<number | undefined> {
  const issueNumber = (args.issueNumber ?? args.pullNumber) as number | undefined;
  if (!issueNumber) return undefined;
  try {
    const res = await octokit.rest.issues.listComments({
      owner: args.owner as string,
      repo: args.repo as string,
      issue_number: issueNumber,
      per_page: 100,
    });
    const mine = (res.data as Array<{ id?: number; body?: string }>).filter((c) => c.body?.includes(marker));
    return mine.length ? mine[mine.length - 1]!.id : undefined;
  } catch {
    return undefined;
  }
}

const findScanComment = (
  octokit: HandlerDeps['octokit'],
  args: { owner: string; repo: string; issueNumber: number },
): Promise<number | undefined> => findForgeComment(octokit, args, '<!-- forge-scan -->');

export function handleAudit(
  deps: HandlerDeps,
  args: { owner: string; repo: string; issueNumber: number; ref: string; date?: string },
): Promise<void> {
  return withLock(`audit:${args.owner}/${args.repo}#${args.issueNumber}`, deps.log, () => doAudit(deps, args));
}

async function doAudit(
  deps: HandlerDeps,
  args: { owner: string; repo: string; issueNumber: number; ref: string; date?: string },
): Promise<void> {
  const { octokit, client, token, log } = deps;
  if (!(await allowRun(deps, args.owner, args.repo, args.issueNumber))) return;
  const ack = await octokit.rest.issues.createComment({
    owner: args.owner,
    repo: args.repo,
    issue_number: args.issueNumber,
    body: `🛡️ **${DISPLAY}** is running a full-repository security audit… I'll update this comment with the report.`,
  });
  const ws = await (deps.workspace ?? realWorkspace).clone({ owner: args.owner, repo: args.repo, ref: args.ref }, token);
  try {
    const repoMap = await buildRepoMap(ws.dir, { maxEntries: 800 });
    // Same order as a review: the free pass first, and the model is told what
    // it already found so it spends its turns on reachability instead.
    const scannedRepo = await runScanners({ cwd: ws.dir }, deps.scanners);
    if (scannedRepo.length) log(`scanners: ${scannedRepo.length} finding(s) before the model ran`);

    const result = await runAgent({
      client,
      system: prompt(deps, auditSystemPrompt()),
      initialContent: [{ type: 'text', text: `${repoMap}\n\nAudit this repository for security vulnerabilities. Be thorough; follow untrusted input to dangerous sinks.` }],
      tools: pick(deps, reviewToolset()),
      limits: limitsFor(deps, Math.max(MAX_ITER, 40)),
      cwd: ws.dir,
      onEvent: watch(deps, 'main', progress(log)),
    });
    deps.run?.add(result);
    // An audit keeps its test-file findings, where a pull-request review drops
    // them. The asymmetry is deliberate: a review comments on a diff somebody
    // is about to merge, and nits about its own fixtures are noise there. An
    // audit is somebody asking what is in the repository — and a key committed
    // to a test file is one of the things they are asking about.
    const findings = mergeFindings(parseFindings(result.finalText), scannedRepo);
    deps.run?.findings(findings);
    // Merge live Dependabot alerts (current CVEs from GitHub's Advisory Database).
    findings.push(...(await fetchDependabotFindings(octokit, args.owner, args.repo, log)));
    const issueNote = await fileFindingIssues(
      deps,
      { owner: args.owner, repo: args.repo, date: args.date ?? 'audit', ...(ack.data.html_url ? { sourceUrl: ack.data.html_url } : {}) },
      findings,
    );

    await octokit.rest.issues.updateComment({
      owner: args.owner,
      repo: args.repo,
      comment_id: ack.data.id,
      body:
        withBudgetNotice(result, client.model, renderAuditReport(findings, DISPLAY)) +
        issueNote +
        costFooter(result.usage, client.model, deps.showCost),
    });
  } finally {
    await ws.cleanup();
  }
}

const MAX_CI_FIX_ATTEMPTS = 2;

/** When a Forge-authored PR's CI fails, read the failures and push a fix (bounded). */
export function handleCiFailure(
  deps: HandlerDeps,
  args: { owner: string; repo: string; pullNumber: number; headBranch: string; headSha: string },
): Promise<void> {
  return withLock(`cifix:${args.owner}/${args.repo}#${args.pullNumber}`, deps.log, () => doCiFailure(deps, args));
}

async function doCiFailure(
  deps: HandlerDeps,
  args: { owner: string; repo: string; pullNumber: number; headBranch: string; headSha: string },
): Promise<void> {
  const { octokit, client, token, log } = deps;
  // Token safety: only auto-fix CI on Forge's OWN PR branches, and cap attempts.
  if (!args.headBranch.startsWith('forge/')) {
    log(`CI failure on ${args.headBranch} is not a Forge branch; skipping.`);
    return;
  }
  const wsOps = deps.workspace ?? realWorkspace;

  // Count prior auto-fix attempts from commit messages to avoid a token-burning loop.
  const commitsRes = await octokit.rest.repos.listCommits({ owner: args.owner, repo: args.repo, sha: args.headBranch, per_page: 20 });
  const attempts = commitsRes.data.filter((c) => /^ci-fix:/m.test(c.commit.message)).length;
  if (attempts >= MAX_CI_FIX_ATTEMPTS) {
    log(`CI still failing after ${attempts} auto-fix attempts on #${args.pullNumber}; leaving for a human.`);
    return;
  }

  // Collect the failing checks (names + summaries) for the head commit.
  const checks = await octokit.rest.checks.listForRef({ owner: args.owner, repo: args.repo, ref: args.headSha });
  const failed = checks.data.check_runs.filter((c) => c.conclusion === 'failure' || c.conclusion === 'timed_out');
  if (failed.length === 0) {
    log(`No failing checks found for ${args.headSha}; skipping.`);
    return;
  }
  const failureText = failed
    .map((c) => `### ${c.name}\n${c.output?.summary ?? ''}\n${(c.output?.text ?? '').slice(0, 4000)}`)
    .join('\n\n')
    .slice(0, 12000);

  const ack = await octokit.rest.issues.createComment({
    owner: args.owner,
    repo: args.repo,
    issue_number: args.pullNumber,
    body: `🔁 **${DISPLAY}** — CI failed; I'm reading the logs and pushing a fix (attempt ${attempts + 1}/${MAX_CI_FIX_ATTEMPTS})…`,
  });

  const ws = await wsOps.clone({ owner: args.owner, repo: args.repo, ref: args.headBranch }, token);
  try {
    const installCmd = await detectInstallCommand(ws.dir);
    if (installCmd) await runCommand(installCmd, { cwd: ws.dir, supportsVision: client.supportsVision }, { timeoutMs: 300_000 });
    const repoMap = await buildRepoMap(ws.dir);
    const result = await runAgent({
      client,
      system: prompt(deps, ciFixSystemPrompt()),
      initialContent: [
        { type: 'text', text: repoMap },
        { type: 'text', text: `CI is failing on PR #${args.pullNumber} (branch ${args.headBranch}). Failing checks:\n\n${failureText}\n\nFix the code so CI passes, then verify with run_tests.` },
      ],
      tools: pick(deps, editToolset({ testCommand: deps.testCommand })),
      limits: limitsFor(deps),
      cwd: ws.dir,
      onEvent: watch(deps, 'main', progress(log)),
    });
    deps.run?.add(result);
    const committed = await wsOps.commitAll(ws, `ci-fix: resolve failing CI on #${args.pullNumber}\n\n${cleanSummary(result.finalText, 1500)}`);
    if (committed) deps.run?.output('commit', { ref: args.headBranch, title: `ci-fix: resolve failing CI on #${args.pullNumber}` });
    if (committed) {
      await wsOps.pushBranch(ws, args.headBranch);
      await octokit.rest.issues.updateComment({
        owner: args.owner,
        repo: args.repo,
        comment_id: ack.data.id,
        body: `🔁 **${DISPLAY}** pushed a CI fix to \`${args.headBranch}\` (attempt ${attempts + 1}/${MAX_CI_FIX_ATTEMPTS}).\n\n${cleanSummary(result.finalText, 1500)}`,
      });
    } else {
      await octokit.rest.issues.updateComment({
        owner: args.owner,
        repo: args.repo,
        comment_id: ack.data.id,
        body: `🔁 **${DISPLAY}** could not auto-fix the CI failure. ${cleanSummary(result.finalText, 1500)}`,
      });
    }
  } finally {
    await ws.cleanup();
  }
}

/**
 * Change-history document: analyze ONE merged change and append an entry.
 *
 * Deliberately scoped to that change's diff — the agent is never asked to
 * summarize the repository. The result goes out as a PR, never a direct push to
 * the default branch.
 */
export function handleHistory(
  deps: HandlerDeps,
  args: { owner: string; repo: string; defaultBranch: string; pullNumber?: number; ref: string; title: string; date: string },
): Promise<void> {
  const key = args.pullNumber ? `pr-${args.pullNumber}` : args.ref;
  return withLock(`history:${args.owner}/${args.repo}#${key}`, deps.log, () => doHistory(deps, args));
}

async function doHistory(
  deps: HandlerDeps,
  args: { owner: string; repo: string; defaultBranch: string; pullNumber?: number; ref: string; title: string; date: string },
): Promise<void> {
  const { octokit, client, token, log } = deps;
  const wsOps = deps.workspace ?? realWorkspace;
  const historyPath = deps.historyPath ?? 'docs/CHANGE-HISTORY.md';
  const perCommit = deps.historyMode === 'per_commit';

  // The diff of THIS change only — a PR's diff, or the pushed commit range.
  let diff = '';
  let sha: string | undefined;
  if (args.pullNumber) {
    diff = await fetchPrDiff(octokit, args.owner, args.repo, args.pullNumber);
  } else {
    try {
      const res = await octokit.request('GET /repos/{owner}/{repo}/commits/{ref}', {
        owner: args.owner,
        repo: args.repo,
        ref: args.ref,
        headers: { accept: 'application/vnd.github.v3.diff' },
      });
      diff = String(res.data ?? '');
      sha = args.ref;
    } catch (err) {
      log(`history: could not fetch commit diff: ${(err as Error).message}`);
      return;
    }
  }
  if (!diff.trim()) {
    log('history: empty diff, nothing to record.');
    return;
  }

  const ws = await wsOps.clone({ owner: args.owner, repo: args.repo, ref: args.defaultBranch }, token);
  try {
    // In single-document mode we read the running file to append to it and to
    // detect a replay. Per-commit mode writes a new file, so there is nothing
    // to read — the filename itself carries the identity.
    const existing = perCommit
      ? ''
      : await fs.readFile(path.join(ws.dir, historyPath), 'utf8').catch(() => '');
    const stub: HistoryEntry = {
      date: args.date,
      title: args.title,
      summary: '',
      areas: [],
      ...(args.pullNumber ? { pullNumber: args.pullNumber } : {}),
      ...(sha ? { sha } : {}),
    };
    const perCommitFile = perCommit ? path.join(historyPath, historyFilename(stub)) : '';
    if (perCommit) {
      // A file that already exists means this change was recorded on an earlier
      // delivery of the same event.
      const exists = await fs
        .access(path.join(ws.dir, perCommitFile))
        .then(() => true)
        .catch(() => false);
      if (exists) {
        log(`history: ${perCommitFile} already exists; skipping.`);
        return;
      }
    } else if (alreadyRecorded(existing, stub)) {
      log('history: this change is already recorded; skipping.');
      return;
    }

    const result = await runAgent({
      client,
      system: prompt(deps, historySystemPrompt()),
      initialContent: [
        {
          type: 'text',
          text:
            `Change: ${args.title}\n\n` +
            `Describe ONLY the change in this diff.\n\n\`\`\`diff\n${diff.slice(0, 120_000)}\n\`\`\``,
        },
      ],
      tools: pick(deps, reviewToolset()),
      limits: limitsFor(deps, Math.min(MAX_ITER, 12)),
      cwd: ws.dir,
      onEvent: watch(deps, 'main', progress(log)),
    });
    deps.run?.add(result);

    const payload = parseHistoryPayload(result.finalText);
    if (!payload) {
      log('history: model did not return a usable entry; skipping.');
      return;
    }

    const entry: HistoryEntry = { ...stub, ...payload };
    const target = perCommit ? perCommitFile : historyPath;
    const contents = perCommit
      ? renderHistoryFile(entry)
      : insertHistoryEntry(existing, renderHistoryEntry(entry));

    const branch = `forge/history-${args.pullNumber ?? (sha ?? 'update').slice(0, 7)}`;
    await wsOps.createBranch(ws, branch);
    await fs.mkdir(path.dirname(path.join(ws.dir, target)), { recursive: true });
    await fs.writeFile(path.join(ws.dir, target), contents, 'utf8');

    const committed = await wsOps.commitAll(ws, `docs: record "${args.title}" in the change history`.slice(0, 200));
    if (committed) deps.run?.output('commit', { title: `docs: record "${args.title}" in the change history`.slice(0, 200) });
    if (!committed) {
      log('history: nothing to commit.');
      return;
    }
    await wsOps.pushBranch(ws, branch);
    const pr = await openPullRequest(octokit, {
      owner: args.owner,
      repo: args.repo,
      title: `docs: change history — ${args.title}`.slice(0, 250),
      body:
        `Records ${args.pullNumber ? `#${args.pullNumber}` : `\`${(sha ?? '').slice(0, 7)}\``} in \`${historyPath}\`.\n\n` +
        `Written from that change's diff only.\n\n---\n\n${renderHistoryEntry(entry)}` +
        costFooter(result.usage, client.model, deps.showCost),
      head: branch,
      base: args.defaultBranch,
    });
    log(`history: opened ${pr.url}`);
  } finally {
    await ws.cleanup();
  }
}

/**
 * Run a saved routine. Started three ways — on a schedule (a workflow `schedule:`
 * invokes the Action), on demand (`/run <name>` in any thread), or by a
 * repository event listed in the routine — and all three land here.
 */
export function handleRoutine(
  deps: HandlerDeps,
  args: {
    owner: string;
    repo: string;
    defaultBranch: string;
    routine: Routine;
    extra?: string;
    issueNumber?: number;
    /** ISO date for the report title; passed in, never read from a clock here. */
    date?: string;
  },
): Promise<void> {
  return withLock(`routine:${args.owner}/${args.repo}:${args.routine.name}`, deps.log, () =>
    doRoutine(deps, args),
  );
}

async function doRoutine(
  deps: HandlerDeps,
  args: {
    owner: string;
    repo: string;
    defaultBranch: string;
    routine: Routine;
    extra?: string;
    issueNumber?: number;
    /** ISO date for the report title; passed in, never read from a clock here. */
    date?: string;
  },
): Promise<void> {
  const { octokit, client, token, log } = deps;
  const r = args.routine;
  const wsOps = deps.workspace ?? realWorkspace;
  const ws = await wsOps.clone({ owner: args.owner, repo: args.repo, ref: args.defaultBranch }, token);

  try {
    const skills = await skillsFor(deps, ws.dir);
    const skill = r.skill ? skills.get(r.skill) : undefined;
    if (r.skill && !skill) {
      log(`routine ${r.name}: unknown skill "${r.skill}"; running with its prompt only.`);
    }

    const instructions = await loadRepoInstructions(ws.dir);
    const conventions = renderProjectContextBlock(instructions);
    const task = [r.prompt, args.extra].filter(Boolean).join('\n\n') || `Run the ${r.name} routine.`;

    let system = prompt(deps, mentionSystemPrompt());
    if (skill) system = applySkill(system, skill, task);

    const base = r.write ? editToolset({ testCommand: deps.testCommand }) : reviewToolset();
    const allowed = r.tools.length ? r.tools : (skill?.tools ?? []);

    const result = await runAgent({
      client,
      system,
      initialContent: [
        { type: 'text', text: await buildRepoMap(ws.dir) },
        ...(conventions ? [{ type: 'text' as const, text: conventions }] : []),
        { type: 'text', text: task },
      ],
      tools: pick(deps, selectTools(base, { allowed })),
      limits: limitsFor(deps),
      cwd: ws.dir,
      ...(r.write ? { security: await createWorkspaceScanner(ws.dir) } : {}),
      onEvent: watch(deps, 'main', progress(log)),
    });
    deps.run?.add(result);

    // A write routine ships its work as a PR — never a direct push.
    if (r.write) {
      const branch = `forge/routine-${r.name}`;
      await wsOps.createBranch(ws, branch);
      if (await wsOps.commitAll(ws, `chore(${r.name}): ${cleanSummary(result.finalText, 120)}`.slice(0, 200))) {
        await wsOps.pushBranch(ws, branch);
        const pr = await openPullRequest(octokit, {
          owner: args.owner,
          repo: args.repo,
          title: `${r.name}: automated update`.slice(0, 250),
          body: `${cleanSummary(result.finalText, 4000)}${costFooter(result.usage, client.model, deps.showCost)}`,
          head: branch,
          base: args.defaultBranch,
        });
        log(`routine ${r.name}: opened ${pr.url}`);
      } else {
        log(`routine ${r.name}: no changes to commit.`);
      }
    }

    const report =
      `### 🤖 ${DISPLAY} — routine \`${r.name}\`\n\n${cleanSummary(result.finalText, 4000)}` +
      costFooter(result.usage, client.model, deps.showCost);

    if (args.issueNumber) {
      // Started from a thread (`/run` or an event) — reply where it was asked.
      await octokit.rest.issues.createComment({
        owner: args.owner,
        repo: args.repo,
        issue_number: args.issueNumber,
        body: report,
      });
    } else if (r.report === 'issue') {
      // A scheduled run has no thread. Without this its findings would only
      // ever reach the Actions log, which nobody reads.
      try {
        const issue = await octokit.rest.issues.create?.({
          owner: args.owner,
          repo: args.repo,
          title: `${r.description || r.name} — ${args.date ?? 'scheduled run'}`.slice(0, 250),
          body: report,
          labels: ['forge:routine'],
        });
        log(`routine ${r.name}: reported in ${issue?.data.html_url ?? 'a new issue'}`);
      } catch (err) {
        log(`routine ${r.name}: could not open a report issue: ${(err as Error).message}`);
      }
    }
  } finally {
    await ws.cleanup();
  }
}

/** Release published → generate notes from the commits in that release. */
export function handleRelease(
  deps: HandlerDeps,
  args: { owner: string; repo: string; defaultBranch: string; tag: string; releaseId: number; previousTag?: string },
): Promise<void> {
  return withLock(`release:${args.owner}/${args.repo}#${args.tag}`, deps.log, () => doRelease(deps, args));
}

async function doRelease(
  deps: HandlerDeps,
  args: { owner: string; repo: string; defaultBranch: string; tag: string; releaseId: number; previousTag?: string },
): Promise<void> {
  const { octokit, client, token, log } = deps;
  const wsOps = deps.workspace ?? realWorkspace;
  const ws = await wsOps.clone({ owner: args.owner, repo: args.repo, ref: args.defaultBranch }, token);
  try {
    // Commit subjects since the previous tag — the input to the notes.
    //
    // The tag is whatever the person who pushed it chose to call it, and git
    // permits `;` and `$()` in a ref name. This used to be interpolated into a
    // shell string, which made publishing a release a way to run commands on
    // the runner. Both halves are checked and neither reaches a shell.
    if (!isSafeRef(args.tag) || (args.previousTag && !isSafeRef(args.previousTag))) {
      log(`release: refusing to read history for an unsafe tag name (${args.tag.slice(0, 40)}); skipping.`);
      return;
    }
    const range = args.previousTag ? `${args.previousTag}..${args.tag}` : args.tag;
    const commits = await wsOps.commitSubjects(ws, range);
    if (!commits.trim()) {
      log('release: no commits found for the range; skipping.');
      return;
    }

    const result = await runAgent({
      client,
      system: prompt(deps, releaseNotesSystemPrompt()),
      initialContent: [
        { type: 'text', text: `Release ${args.tag}. Commits included:\n\n${commits.slice(0, 40_000)}` },
      ],
      tools: pick(deps, reviewToolset()),
      limits: limitsFor(deps, Math.min(MAX_ITER, 10)),
      cwd: ws.dir,
      onEvent: watch(deps, 'main', progress(log)),
    });
    deps.run?.add(result);

    const notes = cleanSummary(result.finalText, 30_000);
    await octokit.rest.repos.updateRelease?.({
      owner: args.owner,
      repo: args.repo,
      release_id: args.releaseId,
      body: `${notes}\n\n---\n<sub>Generated by ${DISPLAY}.</sub>${costFooter(result.usage, client.model, deps.showCost)}`,
    });
    log(`release: updated notes for ${args.tag}`);
  } finally {
    await ws.cleanup();
  }
}

function isFromForge(login: string | undefined): boolean {
  if (!login) return false;
  return /forge|\[bot\]/i.test(login);
}
