/**
 * GitHub host resolution — github.com or a self-hosted GitHub Enterprise Server.
 *
 * Only two things actually differ on GHES: the REST API base URL and the host
 * used to clone. Everything else (App auth, webhooks, permissions, event shapes)
 * is identical, so resolving both here is the whole of GHES support.
 *
 * Resolution order, most specific first:
 *   1. GITHUB_API_URL   — set automatically by GitHub Actions on GHES runners
 *   2. GHES_HOSTNAME    — explicit hostname, e.g. "github.example.com"
 *   3. github.com defaults
 */

export interface GitHubHost {
  /** REST API base, e.g. https://api.github.com or https://github.example.com/api/v3 */
  apiBaseUrl: string;
  /** Web/clone host, e.g. github.com or github.example.com */
  host: string;
  /** True when pointed at a self-hosted instance. */
  isEnterprise: boolean;
}

const DOTCOM: GitHubHost = {
  apiBaseUrl: 'https://api.github.com',
  host: 'github.com',
  isEnterprise: false,
};

function stripTrailingSlash(s: string): string {
  return s.replace(/\/+$/, '');
}

/**
 * Resolve the active GitHub host from the environment. Falls back to github.com
 * for anything unparseable, so a malformed value degrades instead of crashing.
 */
export function resolveHost(env: NodeJS.ProcessEnv = process.env): GitHubHost {
  const apiUrl = env.GITHUB_API_URL?.trim();
  if (apiUrl) {
    try {
      const u = new URL(apiUrl);
      // api.github.com means dotcom even when the var is set explicitly.
      if (u.hostname === 'api.github.com') return DOTCOM;
      return {
        apiBaseUrl: stripTrailingSlash(apiUrl),
        host: u.hostname,
        isEnterprise: true,
      };
    } catch {
      /* fall through to hostname / defaults */
    }
  }

  const hostname = env.GHES_HOSTNAME?.trim();
  if (hostname) {
    const clean = stripTrailingSlash(hostname.replace(/^https?:\/\//, ''));
    if (clean && clean !== 'github.com') {
      // GHES exposes its REST API at /api/v3 rather than a separate api. subdomain.
      return { apiBaseUrl: `https://${clean}/api/v3`, host: clean, isEnterprise: true };
    }
  }

  return DOTCOM;
}

/** Options to pass to `new Octokit(...)`. Empty on github.com (the SDK default). */
export function octokitOptions(host: GitHubHost = resolveHost()): { baseUrl?: string } {
  return host.isEnterprise ? { baseUrl: host.apiBaseUrl } : {};
}

/** Build an authenticated clone URL for the active host. */
export function cloneUrl(owner: string, repo: string, token: string, host: GitHubHost = resolveHost()): string {
  return `https://x-access-token:${token}@${host.host}/${owner}/${repo}.git`;
}
