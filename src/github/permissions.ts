import type { OctokitLike } from './pr.js';

/**
 * Who may set the agent off.
 *
 * A comment or an issue can be written by anyone who can see a public
 * repository. The agent that answers holds `contents: write` and spends the
 * owner's model budget, and on a pull request it pushes commits. So a run that
 * a comment or an issue starts needs someone the repository already trusts to
 * write code: the same bar as pushing the commit by hand.
 *
 * Pull-request events are not gated here. Opening a pull request is how
 * outside contributions arrive, and the review that answers is read-only.
 */

/** Events whose author is whoever typed a comment or opened an issue. */
export const GATED_EVENTS: ReadonlySet<string> = new Set(['issue_comment', 'pull_request_review_comment', 'issues']);

const WRITE_ROLES: ReadonlySet<string> = new Set(['admin', 'maintain', 'write']);

/** Whether `login` can push to the repository. Fails closed: any doubt is a no. */
export async function hasWriteAccess(
  octokit: OctokitLike,
  owner: string,
  repo: string,
  login: string | undefined,
  log: (msg: string) => void = () => {},
): Promise<boolean> {
  if (!login) return false;
  const get = octokit.rest.repos.getCollaboratorPermissionLevel;
  if (!get) {
    log(`permission check unavailable; not running for ${login}`);
    return false;
  }
  try {
    const { data } = await get({ owner, repo, username: login });
    return WRITE_ROLES.has(data.permission ?? '') || WRITE_ROLES.has(data.role_name ?? '');
  } catch (err) {
    // A bot account, a deleted user, or a token without the metadata scope.
    log(`permission check failed for ${login} (${err instanceof Error ? err.message : 'unknown'}); not running`);
    return false;
  }
}

/**
 * Whether this event may start a run. True for events nobody types, such as
 * pushes, pull requests, schedules and releases.
 */
export async function mayTrigger(
  octokit: OctokitLike,
  eventName: string,
  payload: unknown,
  log: (msg: string) => void = () => {},
): Promise<boolean> {
  if (!GATED_EVENTS.has(eventName)) return true;
  const owner = field(field(field(payload, 'repository'), 'owner'), 'login');
  const repo = field(field(payload, 'repository'), 'name');
  if (typeof owner !== 'string' || typeof repo !== 'string') return false;
  const sender = field(field(payload, 'sender'), 'login');
  const login = typeof sender === 'string' ? sender : undefined;
  const allowed = await hasWriteAccess(octokit, owner, repo, login, log);
  if (!allowed) log(`${eventName} from ${login ?? 'unknown'} ignored: only people with write access can start a run`);
  return allowed;
}

function field(v: unknown, key: string): unknown {
  return typeof v === 'object' && v !== null ? Reflect.get(v, key) : undefined;
}
