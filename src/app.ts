import type { Probot, Context } from 'probot';
import { createLLMClient } from './providers/index.js';
import type { ProviderId } from './providers/types.js';
import { handleIssueFix, handlePrReview, handleMention, type HandlerDeps } from './github/handlers.js';
import type { OctokitLike } from './github/pr.js';

const PROVIDER = (process.env.LLM_PROVIDER || 'anthropic') as ProviderId;
const TRIGGER_LABEL = process.env.FORGE_TRIGGER_LABEL || 'agent-fix';
const AUTO_FIX = (process.env.FORGE_AUTO_FIX || 'label') as 'label' | 'opened' | 'off';
const AUTO_REVIEW = (process.env.FORGE_AUTO_REVIEW || 'always') as 'always' | 'requested' | 'off';
const MENTION = (process.env.FORGE_DISPLAY_HANDLE || '@shipit-forge').toLowerCase();

/** Build the dependency bundle for a handler from a Probot context. */
async function deps(context: Context): Promise<HandlerDeps> {
  const auth = (await context.octokit.auth({ type: 'installation' })) as { token: string };
  return {
    octokit: context.octokit as unknown as OctokitLike,
    client: createLLMClient({ provider: PROVIDER }),
    token: auth.token,
    log: (msg: string) => context.log.info(msg),
  };
}

export default function app(probot: Probot): void {
  // --- Fix an issue ---
  probot.on('issues.opened', async (context) => {
    if (AUTO_FIX !== 'opened') return;
    const { repository, issue } = context.payload;
    await handleIssueFix(await deps(context), {
      owner: repository.owner.login,
      repo: repository.name,
      defaultBranch: repository.default_branch,
      issueNumber: issue.number,
      issueTitle: issue.title,
      issueBody: issue.body,
    });
  });

  probot.on('issues.labeled', async (context) => {
    if (AUTO_FIX === 'off') return;
    if (context.payload.label?.name !== TRIGGER_LABEL) return;
    const { repository, issue } = context.payload;
    await handleIssueFix(await deps(context), {
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
    if (AUTO_REVIEW !== 'always') return;
    const { repository, pull_request } = context.payload;
    await handlePrReview(await deps(context), {
      owner: repository.owner.login,
      repo: repository.name,
      pullNumber: pull_request.number,
    });
  });

  // --- Review when invited as a reviewer ---
  probot.on('pull_request.review_requested', async (context) => {
    const { repository, pull_request } = context.payload;
    await handlePrReview(await deps(context), {
      owner: repository.owner.login,
      repo: repository.name,
      pullNumber: pull_request.number,
    });
  });

  // --- Commands & mentions on issues and PRs ---
  probot.on('issue_comment.created', async (context) => {
    const body = (context.payload.comment.body || '').trim();
    const { repository, issue } = context.payload;
    const isPr = Boolean(issue.pull_request);
    const base = {
      owner: repository.owner.login,
      repo: repository.name,
      defaultBranch: repository.default_branch,
    };

    if (/^\/fix\b/i.test(body) && !isPr) {
      await handleIssueFix(await deps(context), {
        ...base,
        issueNumber: issue.number,
        issueTitle: issue.title,
        issueBody: issue.body,
      });
      return;
    }
    if (isPr && /^\/(review|security)\b/i.test(body)) {
      await handlePrReview(await deps(context), {
        owner: base.owner,
        repo: base.repo,
        pullNumber: issue.number,
        securityOnly: /^\/security\b/i.test(body),
      });
      return;
    }
    if (body.toLowerCase().includes(MENTION)) {
      const question = body.replace(new RegExp(MENTION, 'ig'), '').trim();
      await handleMention(await deps(context), {
        ...base,
        issueNumber: issue.number,
        question: question || 'Please help with this thread.',
      });
    }
  });
}
