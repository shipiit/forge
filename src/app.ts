import type { Probot, Context } from 'probot';
import { createLLMClient } from './providers/index.js';
import type { ProviderId } from './providers/types.js';
import { handleIssueFix, handlePrReview, handleMention, handlePrFollowup, type HandlerDeps } from './github/handlers.js';
import type { OctokitLike } from './github/pr.js';
import { redactSecrets } from './util/resilience.js';
import { mergeConfig, defaultConfig, type ForgeConfig } from './config.js';

const PROVIDER = (process.env.LLM_PROVIDER || 'anthropic') as ProviderId;
const MENTION = (process.env.FORGE_DISPLAY_HANDLE || '@shipit-forge').toLowerCase();

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
    client: createLLMClient({ provider: PROVIDER, model: config.model }),
    token: auth.token,
    log: (msg: string) => context.log.info(redactSecrets(msg)),
    testCommand: config.testCommand,
    sarifPath: config.sarifPath,
    selfReview: true,
  };
}

export default function app(probot: Probot): void {
  // --- Fix an issue ---
  probot.on('issues.opened', async (context) => {
    const config = await loadConfig(context);
    if (config.autoFix !== 'opened') return;
    const { repository, issue } = context.payload;
    await handleIssueFix(await deps(context, config), {
      owner: repository.owner.login,
      repo: repository.name,
      defaultBranch: repository.default_branch,
      issueNumber: issue.number,
      issueTitle: issue.title,
      issueBody: issue.body,
    });
  });

  probot.on('issues.labeled', async (context) => {
    const config = await loadConfig(context);
    if (config.autoFix === 'off') return;
    if (context.payload.label?.name !== config.triggerLabel) return;
    const { repository, issue } = context.payload;
    await handleIssueFix(await deps(context, config), {
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
    if (isPr && /^\/(review|security)\b/i.test(body)) {
      await handlePrReview(await deps(context, config), {
        owner: base.owner,
        repo: base.repo,
        pullNumber: issue.number,
        securityOnly: /^\/security\b/i.test(body),
      });
      return;
    }
    if (body.toLowerCase().includes(MENTION)) {
      const question = body.replace(new RegExp(MENTION, 'ig'), '').trim() || 'Please help with this thread.';
      const d = await deps(context, config);
      if (isPr) {
        // On a PR, the agent can push a follow-up commit to the PR branch.
        await handlePrFollowup(d, { owner: base.owner, repo: base.repo, pullNumber: issue.number, question });
      } else {
        await handleMention(d, { ...base, issueNumber: issue.number, question });
      }
    }
  });

  // --- @mention inside a PR review-comment thread → follow-up commit ---
  probot.on('pull_request_review_comment.created', async (context) => {
    const config = await loadConfig(context);
    const body = (context.payload.comment.body || '').trim();
    if (!body.toLowerCase().includes(MENTION)) return;
    const { repository, pull_request } = context.payload;
    const question = body.replace(new RegExp(MENTION, 'ig'), '').trim() || 'Please address this comment.';
    await handlePrFollowup(await deps(context, config), {
      owner: repository.owner.login,
      repo: repository.name,
      pullNumber: pull_request.number,
      question,
    });
  });
}
