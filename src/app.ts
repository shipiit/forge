import type { Probot, Context } from 'probot';
import { createLLMClient } from './providers/index.js';
import type { ProviderId } from './providers/types.js';
import { handleIssueFix, handleIssueAnalyze, handlePrReview, handleMention, handlePrFollowup, handleAudit, handleCiFailure, type HandlerDeps } from './github/handlers.js';
import type { OctokitLike } from './github/pr.js';
import { redactSecrets } from './util/resilience.js';
import { mergeConfig, defaultConfig, type ForgeConfig } from './config.js';

// Read env lazily (inside functions): .env is loaded by Probot AFTER this module
// is imported, so module-level reads would miss it.
const provider = (): ProviderId => (process.env.LLM_PROVIDER || 'anthropic') as ProviderId;
const mentionHandle = (): string => (process.env.FORGE_DISPLAY_HANDLE || '@shipit-forge').toLowerCase();

/** Load per-repo config from .github/agent.yml, merged over env-seeded defaults. */
async function loadConfig(context: Context): Promise<ForgeConfig> {
  try {
    const raw = await context.config('agent.yml');
    return mergeConfig(raw);
  } catch {
    return defaultConfig();
  }
}

/** Build the dependency bundle for a handler from a Probot context. */
async function deps(context: Context, config: ForgeConfig): Promise<HandlerDeps> {
  const auth = (await context.octokit.auth({ type: 'installation' })) as { token: string };
  return {
    octokit: context.octokit as unknown as OctokitLike,
    client: createLLMClient({ provider: provider(), model: config.model }),
    token: auth.token,
    log: (msg: string) => context.log.info(redactSecrets(msg)),
    testCommand: config.testCommand,
    sarifPath: config.sarifPath,
    selfReview: true,
  };
}

export default function app(probot: Probot): void {
  // --- Analyze a new issue (default): post a detailed diagnosis comment, no PR. ---
  probot.on('issues.opened', async (context) => {
    const config = await loadConfig(context);
    if (config.autoFix === 'off') return;
    const { repository, issue } = context.payload;
    await handleIssueAnalyze(await deps(context, config), {
      owner: repository.owner.login,
      repo: repository.name,
      defaultBranch: repository.default_branch,
      issueNumber: issue.number,
      issueTitle: issue.title,
      issueBody: issue.body,
    });
  });

  // --- Labeled with the trigger label → analyze too (PR happens on /fix). ---
  probot.on('issues.labeled', async (context) => {
    const config = await loadConfig(context);
    if (config.autoFix === 'off') return;
    if (context.payload.label?.name !== config.triggerLabel) return;
    const { repository, issue } = context.payload;
    await handleIssueAnalyze(await deps(context, config), {
      owner: repository.owner.login,
      repo: repository.name,
      defaultBranch: repository.default_branch,
      issueNumber: issue.number,
      issueTitle: issue.title,
      issueBody: issue.body,
    });
  });

  // --- Review a PR automatically ---
  probot.on(['pull_request.opened', 'pull_request.synchronize'], async (context) => {
    const config = await loadConfig(context);
    if (config.autoReview !== 'always') return;
    const { repository, pull_request } = context.payload;
    await handlePrReview(await deps(context, config), {
      owner: repository.owner.login,
      repo: repository.name,
      pullNumber: pull_request.number,
    });
  });

  // --- Review when invited as a reviewer ---
  probot.on('pull_request.review_requested', async (context) => {
    const config = await loadConfig(context);
    const { repository, pull_request } = context.payload;
    await handlePrReview(await deps(context, config), {
      owner: repository.owner.login,
      repo: repository.name,
      pullNumber: pull_request.number,
    });
  });

  // --- Commands & mentions on issues and PRs ---
  probot.on('issue_comment.created', async (context) => {
    const config = await loadConfig(context);
    const body = (context.payload.comment.body || '').trim();
    const { repository, issue } = context.payload;
    const isPr = Boolean(issue.pull_request);
    const base = {
      owner: repository.owner.login,
      repo: repository.name,
      defaultBranch: repository.default_branch,
    };

    if (/^\/fix\b/i.test(body) && !isPr) {
      await handleIssueFix(await deps(context, config), {
        ...base,
        issueNumber: issue.number,
        issueTitle: issue.title,
        issueBody: issue.body,
      });
      return;
    }
    if (/^\/audit\b/i.test(body)) {
      // Full-repository security audit (works on an issue or a PR thread).
      await handleAudit(await deps(context, config), {
        owner: base.owner,
        repo: base.repo,
        issueNumber: issue.number,
        ref: base.defaultBranch,
      });
      return;
    }
    if (isPr && /^\/(review|security)\b/i.test(body)) {
      await handlePrReview(await deps(context, config), {
        owner: base.owner,
        repo: base.repo,
        pullNumber: issue.number,
        securityOnly: /^\/security\b/i.test(body),
      });
      return;
    }
    if (body.toLowerCase().includes(mentionHandle())) {
      const question = body.replace(new RegExp(mentionHandle(), 'ig'), '').trim() || 'Please help with this thread.';
      const d = await deps(context, config);
      const wantsFix = /\b(fix|implement|patch|create (a )?pr|open (a )?pr|resolve)\b/i.test(question);
      if (isPr) {
        // On a PR, the agent can push a follow-up commit to the PR branch.
        await handlePrFollowup(d, { owner: base.owner, repo: base.repo, pullNumber: issue.number, question });
      } else if (wantsFix) {
        // "@forge fix this / create a PR" on an issue → implement + open a PR (idempotent).
        await handleIssueFix(d, { ...base, issueNumber: issue.number, issueTitle: issue.title, issueBody: issue.body });
      } else {
        await handleMention(d, { ...base, issueNumber: issue.number, question });
      }
    }
  });

  // --- CI failed on a Forge PR → read logs and push a fix (bounded) ---
  const onCiCompleted = async (context: Context) => {
    const config = await loadConfig(context);
    const p = context.payload as any;
    const run = p.check_suite ?? p.workflow_run;
    if (!run || run.conclusion !== 'failure') return;
    const repository = p.repository;
    const prs: any[] = run.pull_requests ?? [];
    for (const pr of prs) {
      const headBranch: string = pr.head?.ref ?? run.head_branch ?? '';
      if (!headBranch.startsWith('forge/')) continue; // only its own PRs (token safety)
      await handleCiFailure(await deps(context, config), {
        owner: repository.owner.login,
        repo: repository.name,
        pullNumber: pr.number,
        headBranch,
        headSha: pr.head?.sha ?? run.head_sha,
      });
    }
  };
  probot.on('check_suite.completed', onCiCompleted);
  probot.on('workflow_run.completed', onCiCompleted);

  // --- @mention inside a PR review-comment thread → follow-up commit ---
  probot.on('pull_request_review_comment.created', async (context) => {
    const config = await loadConfig(context);
    const body = (context.payload.comment.body || '').trim();
    if (!body.toLowerCase().includes(mentionHandle())) return;
    const { repository, pull_request } = context.payload;
    const question = body.replace(new RegExp(mentionHandle(), 'ig'), '').trim() || 'Please address this comment.';
    await handlePrFollowup(await deps(context, config), {
      owner: repository.owner.login,
      repo: repository.name,
      pullNumber: pull_request.number,
      question,
    });
  });
}
