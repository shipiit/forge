import type { Probot, Context } from "probot";
import { createLLMClient } from "./providers/index.js";
import type { ProviderId } from "./providers/types.js";
import {
  handleIssueFix,
  handleIssueAnalyze,
  handlePrReview,
  handleMention,
  handlePrFollowup,
  handleAudit,
  handleCiFailure,
  handleHistory,
  handleRelease,
  handleRoutine,
  handleScan,
  type HandlerDeps,
} from "./github/handlers.js";
import { scannersFor } from "./scan/index.js";
import type { OctokitLike } from "./github/pr.js";
import { redactSecrets } from "./util/resilience.js";
import { mergeConfig, defaultConfig, type ForgeConfig } from "./config.js";
import { findRoutine, parseRunCommand, routinesForEvent } from "./routines.js";
import { prSubject } from "./github/router.js";
import { resolveHost } from "./github/host.js";
import { createRecorder, tracked, type Flow } from "./usage/index.js";
import { mountDashboard, type RouterLike } from './usage/serve.js';

// Read env lazily (inside functions): .env is loaded by Probot AFTER this module
// is imported, so module-level reads would miss it.
const provider = (): ProviderId =>
  (process.env.LLM_PROVIDER || "anthropic") as ProviderId;
/** Per-repo `trigger_phrase` wins; the env var is only the org-wide default. */
const mentionHandle = (config: ForgeConfig): string => config.triggerPhrase;

/** Load per-repo config from .github/agent.yml, merged over env-seeded defaults. */
async function loadConfig(context: Context): Promise<ForgeConfig> {
  try {
    const raw = await context.config("agent.yml");
    return mergeConfig(raw);
  } catch {
    return defaultConfig();
  }
}

/** Build the dependency bundle for a handler from a Probot context. */
async function deps(
  context: Context,
  config: ForgeConfig,
): Promise<HandlerDeps> {
  const auth = (await context.octokit.auth({ type: "installation" })) as {
    token: string;
  };
  return {
    octokit: context.octokit as unknown as OctokitLike,
    client: createLLMClient({ provider: provider(), model: config.model }),
    token: auth.token,
    log: (msg: string) => context.log.info(redactSecrets(msg)),
    testCommand: config.testCommand,
    sarifPath: config.sarifPath,
    maxNits: config.maxNits,
    historyPath: config.historyPath,
    historyMode: config.historyMode,
    spendCapPerRunUsd: config.spendCapPerRunUsd,
    maxRunsPerHour: config.maxRunsPerHour,
    showCost: config.showCost,
    findingsToIssues: config.findingsToIssues,
    findingsMinSeverity: config.findingsMinSeverity,
    findingsMaxIssues: config.findingsMaxIssues,
    selfReview: true,
    scanners: scannersFor(config),
  };
}

/** What a dispatch needs to say about itself before the work starts. */
interface RunSpec {
  flow: Flow;
  owner: string;
  repo: string;
  issueNumber?: number;
  prNumber?: number;
  routine?: string;
}

/**
 * Build the deps, open a recording, run the handler, close the recording.
 *
 * Every webhook goes through here so a run is opened and closed in exactly one
 * place. `tracked` closes in a `finally`, which is what keeps a handler that
 * throws from leaving a row stuck at `running` forever.
 */
async function dispatch(
  context: Context,
  config: ForgeConfig,
  spec: RunSpec,
  fn: (d: HandlerDeps) => Promise<unknown>,
): Promise<void> {
  const d = await deps(context, config);
  const { flow, owner, repo, ...rest } = spec;
  await tracked(
    {
      recorder: createRecorder(),
      client: d.client,
      meta: {
        host: resolveHost().host,
        owner,
        repo,
        surface: "app",
        flow,
        trigger:
          `${context.name}.${(context.payload as { action?: string }).action ?? ""}`.replace(
            /\.$/,
            "",
          ),
        ...(actorOf(context) ? { actor: actorOf(context) } : {}),
        ...rest,
      },
    },
    async (run) => fn({ ...d, run }),
  );
}

/** Who set this off. Absent for pushes and scheduled work, which is fine. */
function actorOf(context: Context): string | undefined {
  const p = context.payload as { sender?: { login?: string } };
  return p.sender?.login;
}

export default function app(probot: Probot, options: { getRouter?: (path?: string) => RouterLike } = {}): void {
  // The usage dashboard, on the server that is already running. Gated on
  // FORGE_DASHBOARD_TOKEN and mounted only when recording is on.
  mountDashboard(options.getRouter, process.env, (msg) => probot.log.info(msg));

  // --- Analyze a new issue (default): post a detailed diagnosis comment, no PR. ---
  probot.on("issues.opened", async (context) => {
    const config = await loadConfig(context);
    if (config.autoFix === "off") return;
    const { repository, issue } = context.payload;
    const base = {
      owner: repository.owner.login,
      repo: repository.name,
      issueNumber: issue.number,
    };
    await dispatch(context, config, { flow: "analyze", ...base }, (d) =>
      handleIssueAnalyze(d, {
        ...base,
        defaultBranch: repository.default_branch,
        issueTitle: issue.title,
        issueBody: issue.body,
      }),
    );
  });

  // --- Labeled with the trigger label → analyze too (PR happens on /fix). ---
  probot.on("issues.labeled", async (context) => {
    const config = await loadConfig(context);
    if (config.autoFix === "off") return;
    if (context.payload.label?.name !== config.triggerLabel) return;
    const { repository, issue } = context.payload;
    const base = {
      owner: repository.owner.login,
      repo: repository.name,
      issueNumber: issue.number,
    };
    await dispatch(context, config, { flow: "analyze", ...base }, (d) =>
      handleIssueAnalyze(d, {
        ...base,
        defaultBranch: repository.default_branch,
        issueTitle: issue.title,
        issueBody: issue.body,
      }),
    );
  });

  // --- Review a PR automatically ---
  probot.on(
    ["pull_request.opened", "pull_request.synchronize"],
    async (context) => {
      const config = await loadConfig(context);
      const { repository, pull_request } = context.payload;
      const base = { owner: repository.owner.login, repo: repository.name };

      // The credential scan runs whatever the review cadence is: it costs
      // nothing, and a key committed to a branch is already public to anyone
      // who can clone it.
      if (config.secretScan || config.codeScan) {
        await dispatch(
          context,
          config,
          { flow: 'audit', ...base, prNumber: pull_request.number },
          (d) =>
            handleScan(d, {
              ...base,
              issueNumber: pull_request.number,
              pullNumber: pull_request.number,
              ref: pull_request.head.ref,
            }),
        );
      }
      if (config.autoReview !== "always") return;
      await dispatch(
        context,
        config,
        { flow: "review", ...base, prNumber: pull_request.number },
        (d) => handlePrReview(d, { ...base, pullNumber: pull_request.number }),
      );
    },
  );

  // --- Review when invited as a reviewer ---
  probot.on("pull_request.review_requested", async (context) => {
    const config = await loadConfig(context);
    const { repository, pull_request } = context.payload;
    const base = { owner: repository.owner.login, repo: repository.name };
    await dispatch(
      context,
      config,
      { flow: "review", ...base, prNumber: pull_request.number },
      (d) => handlePrReview(d, { ...base, pullNumber: pull_request.number }),
    );
  });

  // --- Commands & mentions on issues and PRs ---
  probot.on("issue_comment.created", async (context) => {
    const config = await loadConfig(context);
    const body = (context.payload.comment.body || "").trim();
    const { repository, issue } = context.payload;
    const isPr = Boolean(issue.pull_request);
    const ref = { owner: repository.owner.login, repo: repository.name };
    const base = { ...ref, defaultBranch: repository.default_branch };

    if (/^\/fix\b/i.test(body) && !isPr) {
      await dispatch(
        context,
        config,
        { flow: "fix", ...ref, issueNumber: issue.number },
        (d) =>
          handleIssueFix(d, {
            ...base,
            issueNumber: issue.number,
            issueTitle: issue.title,
            issueBody: issue.body,
          }),
      );
      return;
    }
    // `/run <routine>` — start a saved routine on demand from any thread.
    const run = parseRunCommand(body);
    if (run) {
      const routine = findRoutine(config.routines, run.name);
      if (!routine || !routine.manual) return;
      await dispatch(
        context,
        config,
        {
          flow: "routine",
          ...ref,
          issueNumber: issue.number,
          routine: routine.name,
        },
        (d) =>
          handleRoutine(d, {
            ...base,
            routine,
            extra: run.args,
            issueNumber: issue.number,
          }),
      );
      return;
    }
    const help = body.match(/^\/(?:help|how|how-to)\b[ \t]*([\s\S]*)$/i);
    if (help) {
      await dispatch(context, config, { flow: 'mention', ...ref, issueNumber: issue.number }, (d) =>
        handleMention(d, {
          ...base,
          issueNumber: issue.number,
          question: (help[1] ?? '').trim() || 'What is this project and how do I use it?',
          skill: 'how-to',
          issueTitle: issue.title,
          issueBody: issue.body,
        }),
      );
      return;
    }
    if (/^\/(?:secrets?|secret-scan|scan)\b/i.test(body)) {
      await dispatch(context, config, { flow: 'audit', ...ref, issueNumber: issue.number }, (d) =>
        handleScan(d, {
          ...ref,
          issueNumber: issue.number,
          ref: base.defaultBranch,
          ...(isPr ? { pullNumber: issue.number } : {}),
        }),
      );
      return;
    }
    if (/^\/audit\b/i.test(body)) {
      // Full-repository security audit (works on an issue or a PR thread).
      await dispatch(
        context,
        config,
        { flow: "audit", ...ref, issueNumber: issue.number },
        (d) =>
          handleAudit(d, {
            ...ref,
            issueNumber: issue.number,
            ref: base.defaultBranch,
          }),
      );
      return;
    }
    if (isPr && /^\/(review|security)\b/i.test(body)) {
      await dispatch(
        context,
        config,
        { flow: "review", ...ref, prNumber: issue.number },
        (d) =>
          handlePrReview(d, {
            ...ref,
            pullNumber: issue.number,
            securityOnly: /^\/security\b/i.test(body),
          }),
      );
      return;
    }
    if (body.toLowerCase().includes(mentionHandle(config))) {
      const question =
        body.replace(new RegExp(mentionHandle(config), "ig"), "").trim() ||
        "Please help with this thread.";
      const wantsFix =
        /\b(fix|implement|patch|create (a )?pr|open (a )?pr|resolve)\b/i.test(
          question,
        );
      if (isPr) {
        // On a PR, the agent can push a follow-up commit to the PR branch.
        await dispatch(
          context,
          config,
          { flow: "followup", ...ref, prNumber: issue.number },
          (d) =>
            handlePrFollowup(d, { ...ref, pullNumber: issue.number, question }),
        );
      } else if (wantsFix) {
        // "@forge fix this / create a PR" on an issue → implement + open a PR (idempotent).
        await dispatch(
          context,
          config,
          { flow: "fix", ...ref, issueNumber: issue.number },
          (d) =>
            handleIssueFix(d, {
              ...base,
              issueNumber: issue.number,
              issueTitle: issue.title,
              issueBody: issue.body,
            }),
        );
      } else {
        await dispatch(
          context,
          config,
          { flow: "mention", ...ref, issueNumber: issue.number },
          (d) =>
            handleMention(d, {
            ...base,
            issueNumber: issue.number,
            question,
            issueTitle: issue.title,
            issueBody: issue.body,
          }),
        );
      }
    }
  });

  // --- CI failed on a Forge PR → read logs and push a fix (bounded) ---
  const onCiCompleted = async (context: Context) => {
    const config = await loadConfig(context);
    const p = context.payload as any;
    const run = p.check_suite ?? p.workflow_run;
    if (!run || run.conclusion !== "failure") return;
    const repository = p.repository;
    const prs: any[] = run.pull_requests ?? [];
    for (const pr of prs) {
      const headBranch: string = pr.head?.ref ?? run.head_branch ?? "";
      if (!headBranch.startsWith("forge/")) continue; // only its own PRs (token safety)
      const ref = { owner: repository.owner.login, repo: repository.name };
      await dispatch(
        context,
        config,
        { flow: "ci", ...ref, prNumber: pr.number },
        (d) =>
          handleCiFailure(d, {
            ...ref,
            pullNumber: pr.number,
            headBranch,
            headSha: pr.head?.sha ?? run.head_sha,
          }),
      );
    }
  };
  probot.on("check_suite.completed", onCiCompleted);
  probot.on("workflow_run.completed", onCiCompleted);

  // --- Merged PR / push to default branch → change-history entry (opt-in) ---
  probot.on("pull_request.closed", async (context) => {
    const config = await loadConfig(context);
    const { repository, pull_request } = context.payload;
    if (!config.historyEnabled || !pull_request.merged) return;
    const ref = { owner: repository.owner.login, repo: repository.name };
    await dispatch(
      context,
      config,
      { flow: "history", ...ref, prNumber: pull_request.number },
      (d) =>
        handleHistory(d, {
          ...ref,
          defaultBranch: repository.default_branch,
          pullNumber: pull_request.number,
          ref: repository.default_branch,
          title: pull_request.title,
          // Take the date from the event, never a clock read at handling time.
          date: (pull_request.merged_at ?? new Date().toISOString()).slice(
            0,
            10,
          ),
        }),
    );
  });

  // --- Event-triggered routines: any routine that lists this event runs ---
  const onRoutineEvent = async (context: Context) => {
    const config = await loadConfig(context);
    if (config.routines.length === 0) return;
    const p = context.payload as any;
    const subject = p.pull_request ? prSubject(p.pull_request) : {};
    const matches = routinesForEvent(
      config.routines,
      context.name,
      p.action,
      subject,
    );
    if (matches.length === 0) return;
    const ref = { owner: p.repository.owner.login, repo: p.repository.name };
    const on = p.issue?.number ?? p.pull_request?.number;
    for (const routine of matches) {
      await dispatch(
        context,
        config,
        {
          flow: "routine",
          ...ref,
          routine: routine.name,
          ...(on ? { issueNumber: on } : {}),
        },
        (d) =>
          handleRoutine(d, {
            ...ref,
            defaultBranch: p.repository.default_branch,
            routine,
            ...(on ? { issueNumber: on } : {}),
          }),
      );
    }
  };
  probot.on(["push", "pull_request", "issues", "release"], onRoutineEvent);

  // --- Release published → generate notes from that release's commits ---
  probot.on(["release.published", "release.created"], async (context) => {
    const config = await loadConfig(context);
    const { repository, release } = context.payload as any;
    const ref = { owner: repository.owner.login, repo: repository.name };
    await dispatch(context, config, { flow: "release", ...ref }, (d) =>
      handleRelease(d, {
        ...ref,
        defaultBranch: repository.default_branch,
        tag: release.tag_name,
        releaseId: release.id,
      }),
    );
  });

  // --- @mention inside a PR review-comment thread → follow-up commit ---
  probot.on("pull_request_review_comment.created", async (context) => {
    const config = await loadConfig(context);
    const body = (context.payload.comment.body || "").trim();
    if (!body.toLowerCase().includes(mentionHandle(config))) return;
    const { repository, pull_request } = context.payload;
    const question =
      body.replace(new RegExp(mentionHandle(config), "ig"), "").trim() ||
      "Please address this comment.";
    const ref = { owner: repository.owner.login, repo: repository.name };
    await dispatch(
      context,
      config,
      { flow: "followup", ...ref, prNumber: pull_request.number },
      (d) =>
        handlePrFollowup(d, {
          ...ref,
          pullNumber: pull_request.number,
          question,
        }),
    );
  });
}
