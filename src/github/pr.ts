/** Thin wrappers over the GitHub REST API for opening PRs and posting reviews. */

export interface OctokitLike {
  rest: {
    pulls: {
      create(params: Record<string, unknown>): Promise<{ data: { number: number; html_url: string } }>;
      createReview(params: Record<string, unknown>): Promise<unknown>;
      get(params: Record<string, unknown>): Promise<{ data: { body: string | null; title: string; head: { ref: string; sha: string }; base: { ref: string } } }>;
      list(params: Record<string, unknown>): Promise<{ data: Array<{ number: number; html_url: string }> }>;
      listReviewComments?(params: Record<string, unknown>): Promise<unknown>;
    };
    issues: {
      createComment(params: Record<string, unknown>): Promise<{ data: { id: number } }>;
      updateComment(params: Record<string, unknown>): Promise<unknown>;
      listComments(params: Record<string, unknown>): Promise<{ data: Array<{ user: { login: string } | null; body?: string }> }>;
    };
    checks: {
      listForRef(params: Record<string, unknown>): Promise<{
        data: { check_runs: Array<{ name: string; conclusion: string | null; details_url?: string; output?: { title?: string | null; summary?: string | null; text?: string | null } }> };
      }>;
    };
    repos: {
      listCommits(params: Record<string, unknown>): Promise<{ data: Array<{ commit: { message: string } }> }>;
    };
    dependabot?: {
      listAlertsForRepo(params: Record<string, unknown>): Promise<{ data: unknown[] }>;
    };
  };
  request(route: string, params: Record<string, unknown>): Promise<{ data: unknown }>;
}

export interface OpenPrParams {
  owner: string;
  repo: string;
  title: string;
  body: string;
  head: string;
  base: string;
  draft?: boolean;
}

export async function openPullRequest(
  octokit: OctokitLike,
  params: OpenPrParams,
): Promise<{ number: number; url: string }> {
  const res = await octokit.rest.pulls.create({
    owner: params.owner,
    repo: params.repo,
    title: params.title,
    body: params.body,
    head: params.head,
    base: params.base,
    draft: params.draft ?? false,
  });
  return { number: res.data.number, url: res.data.html_url };
}

/** Compose the PR body for a fix, linking the originating issue. */
export function composeFixPrBody(opts: {
  issueNumber: number;
  summary: string;
  testsPassed: boolean | null;
  testOutput?: string;
}): string {
  const verify =
    opts.testsPassed === null
      ? 'No test suite was detected, so changes were not automatically verified.'
      : opts.testsPassed
        ? '✅ Project tests pass after the change.'
        : '⚠️ Project tests did **not** pass — opening as a draft for review.';
  return (
    `## What ${process.env.FORGE_DISPLAY_NAME || 'ShipIT Forge'} did\n\n` +
    `${opts.summary}\n\n` +
    `## Verification\n\n${verify}\n` +
    (opts.testOutput ? `\n<details><summary>test output</summary>\n\n\`\`\`\n${opts.testOutput}\n\`\`\`\n</details>\n` : '') +
    `\n---\nCloses #${opts.issueNumber}\n`
  );
}

/** Fetch a PR's unified diff via the `application/vnd.github.v3.diff` media type. */
export async function fetchPrDiff(
  octokit: OctokitLike,
  owner: string,
  repo: string,
  pull_number: number,
): Promise<string> {
  const res = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
    owner,
    repo,
    pull_number,
    headers: { accept: 'application/vnd.github.v3.diff' },
  });
  return res.data as string;
}
