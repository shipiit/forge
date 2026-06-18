import type { ContentPart } from '../providers/types.js';
import { downloadImages, extractImageUrls, makeFetcher } from './images.js';

export interface IssueLike {
  number: number;
  title: string;
  body: string | null;
}

export interface PullLike {
  number: number;
  title: string;
  body: string | null;
}

export interface CommentLike {
  user: string;
  body: string;
}

/**
 * Build the initial agent content for fixing an issue: a text block describing
 * the issue and its comments, followed by any images extracted from them.
 */
export async function buildIssueContent(
  issue: IssueLike,
  comments: CommentLike[],
  token: string,
  log: (msg: string) => void = () => {},
): Promise<ContentPart[]> {
  const text =
    `You are fixing GitHub issue #${issue.number}: ${issue.title}\n\n` +
    `Issue description:\n${issue.body ?? '(no description)'}\n\n` +
    (comments.length
      ? `Discussion:\n${comments.map((c) => `@${c.user}: ${c.body}`).join('\n\n')}\n\n`
      : '') +
    `Investigate the repository, implement a fix, and verify it by running the tests.`;

  const bodies = [issue.body ?? '', ...comments.map((c) => c.body)].join('\n');
  const images = await downloadImages(extractImageUrls(bodies), makeFetcher(token), log);
  return [{ type: 'text', text }, ...images];
}

/**
 * Build the initial agent content for reviewing a PR: the PR description, the
 * unified diff, and any images from the description/comments.
 */
export async function buildReviewContent(
  pull: PullLike,
  diff: string,
  comments: CommentLike[],
  token: string,
  opts: { securityOnly?: boolean } = {},
  log: (msg: string) => void = () => {},
): Promise<ContentPart[]> {
  const focus = opts.securityOnly ? 'Focus only on security vulnerabilities.' : '';
  const text =
    `Review pull request #${pull.number}: ${pull.title}\n\n` +
    `Description:\n${pull.body ?? '(none)'}\n\n${focus}\n\n` +
    `Unified diff under review:\n\n\`\`\`diff\n${diff}\n\`\`\`\n\n` +
    `Use the read-only tools to inspect surrounding code as needed, then output the findings JSON.`;

  const bodies = [pull.body ?? '', ...comments.map((c) => c.body)].join('\n');
  const images = await downloadImages(extractImageUrls(bodies), makeFetcher(token), log);
  return [{ type: 'text', text }, ...images];
}
