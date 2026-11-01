/**
 * The specialist slices of a whole-repository audit.
 *
 * Adapted from the shipiit/pentest-skills deep-security-audit slices for a
 * static run: no live target, no logins, no database. Each slice is one
 * attacker's question asked of the whole codebase by its own agent, so eight
 * narrow reads replace one broad one that runs out of turns on the first
 * interesting file. A repository can replace them with `audit_skills:`.
 */

/** The ASVS-style coverage rows a static audit can speak to. */
export const COVERAGE_ROWS: Record<number, string> = {
  1: 'Architecture, secrets, configuration',
  2: 'Authentication',
  3: 'Session management',
  4: 'Access control',
  5: 'Input validation & injection',
  6: 'Cryptography',
  7: 'Error handling & logging',
  8: 'Data protection & privacy',
  9: 'Communications',
  10: 'Business logic',
  11: 'Files & resources',
  12: 'API & web services',
  13: 'Supply chain & CI/CD',
  14: 'Frontend / client',
  15: 'AI / LLM features',
  16: 'Recon / edge',
  17: 'Retest of prior reports',
};

/** Rows only a live target can answer; a static audit says so rather than guessing. */
export const DYNAMIC_ONLY_ROWS: Record<number, string> = {
  9: 'needs a deployed host to check TLS and headers',
  16: 'needs authorised hosts for DNS and edge recon',
  17: 'needs a prior report to re-verify',
};

export type SliceNeed = 'always' | 'frontend' | 'llm';

export interface AuditSlice {
  id: string;
  title: string;
  /** Coverage rows this slice reports on. */
  rows: number[];
  /** When the slice is worth its tokens. */
  needs: SliceNeed;
  prompt: string;
}

export const BUILT_IN_SLICES: AuditSlice[] = [
  {
    id: 'auth',
    title: 'Authentication & sessions',
    rows: [2, 3],
    needs: 'always',
    prompt: `Enumerate every way a principal is authenticated: login (session, JWT, OAuth), OTP/2FA, emailed links
or codes, API keys, admin, websockets, webhooks (HMAC), password reset, social login. For each give the
file:line of the check, token type, lifetime, rotation and revocation, brute-force protection, and where the
secret lives.

Hunt: auth bypass (a pre-OTP token accepted anywhere; a token endpoint callable directly), OTP enforced only by
the browser flow, tokens from a non-CSPRNG or stored unhashed, user enumeration through messages or timing,
logout that does not revoke, long-lived refresh tokens, API-key comparison that is not constant-time, cookie
flags, CORS or CSRF gaps beside cookie auth, rate limits keyed on a field the client chooses, writable role
fields, social accounts linked by email alone, unsigned OAuth state, trusting a client IP header.`,
  },
  {
    id: 'access',
    title: 'Authorization & object access (IDOR)',
    rows: [4, 12],
    needs: 'always',
    prompt: `Walk the router, not a grep: list every route with its method, handler (file:line) and the permission
it actually enforces. What does the framework allow when a handler declares nothing?

Hunt: handlers with no permission, AllowAny on non-public routes, commented-out checks, GET that mutates, an id
from the URL or body used without scoping to the caller (IDOR), mass assignment (fields="__all__", writable
status, paid, amount, role, email, tenant), unbounded list and export endpoints, feature flags enforced only in
the UI, file download paths, webhook routes without signature checks, single-use links that are not, search
endpoints that leak existence, tenant filters taken from the request instead of the token, API keys that can
reach everything, agent or tool endpoints.`,
  },
  {
    id: 'injection',
    title: 'Injection, SSRF, files & crypto',
    rows: [5, 6, 11],
    needs: 'always',
    prompt: `Follow every value an outsider controls to every dangerous sink.

SQL: raw queries, string-built SQL, order_by/filter built from request data. Code: eval, exec, pickle, marshal,
yaml.load, dynamic import from a payload, subprocess with a shell. Templates rendered from user strings,
mark_safe, autoescape off, HTML built with f-strings. XML without defusedxml (XXE). ReDoS on unbounded input.
Paths: open()/sendFile/FileResponse joined from request data without a base-dir check, zip-slip.
Outbound HTTP: is the URL or host user- or model-controlled; allowlist, redirects, timeouts; PDF and HTML
renderers' fetchers. Files: type sniffing, size caps, filename sanitising, served inline.
Crypto: key source, one key for everything, rotation, encrypt-on-save bypasses, swallowed encryption errors,
md5/sha1 for passwords, Math.random or random for tokens.`,
  },
  {
    id: 'config',
    title: 'Configuration, infrastructure & CI/CD',
    rows: [1, 13],
    needs: 'always',
    prompt: `Settings per environment: DEBUG, allowed hosts, CORS, CSRF, secure-cookie and HSTS settings, default
permissions and throttles, upload limits, storage ACLs and presigned-URL lifetimes, logging config, cache and
broker URLs without auth or TLS. Secrets in tracked files.

Containers: base image pinning and EOL, running as root, secrets in layers, missing .dockerignore, dev tools in
production images, migrations racing on every replica, proxy headers trusted end to end.
Workflows: actions pinned to tags instead of SHAs, missing permissions:, pull_request_target with a checkout of
the PR, untrusted event text in run:, secrets echoed, static cloud keys instead of OIDC, scan steps that never
gate. Supply chain: lockfiles and hashes, git dependencies on mutable refs, dependency-confusion surface,
postinstall scripts, vendored libraries outside any advisory feed, tracked .env or data files.`,
  },
  {
    id: 'logic',
    title: 'Business logic & money',
    rows: [10],
    needs: 'always',
    prompt: `Think as four attackers: a customer with a link, a partner with an emailed code, a low-privilege
insider, and an outsider with a webhook URL. Map each important flow as a state machine: states, who may move
it, where that is enforced.

Hunt: payment or paid-status changed through any write path (generic update, admin, tools, background jobs),
amounts or prices computed on the client, floats for money, double-submit races without locking or idempotency
keys, approvals that can be self-selected or satisfied by one person, approval links consumed by GET,
compliance checks that are advisory rather than blocking, codes that can be replayed or spammed, expensive jobs
anyone can trigger, sequential ids that allow bulk harvesting.`,
  },
  {
    id: 'data',
    title: 'Personal data, logging & retention',
    rows: [7, 8],
    needs: 'always',
    prompt: `Build a PII inventory: model, field, category, encrypted or not, and where it is exposed (API, export,
email, log, LLM prompt), with file:line. Highlight plaintext PII beside encrypted columns, and decrypted data in
audit tables, request logs, admin search, error emails and exports.

Hunt: secrets, tokens or PII in logs and exception messages, stack traces or str(e) returned to clients, Sentry
without scrubbing, task arguments logged, tables that only grow with no purge, deletion that leaves copies,
third parties receiving more than they need, committed data files.`,
  },
  {
    id: 'frontend',
    title: 'Frontend & client',
    rows: [14],
    needs: 'frontend',
    prompt: `Token storage (localStorage vs cookies), tokens in URLs or Referer, logout completeness, which hosts
receive the Authorization header. XSS: every dangerouslySetInnerHTML, innerHTML, v-html and href/src built from
data; markdown and rich-text renderers and their sanitizer allowlists; SVG/HTML/PDF previews; postMessage
without an origin check. Route guards versus what the API enforces (a hidden button is not a permission).
Leaks: console output shipped, analytics payloads, source maps, hard-coded keys, public env variables that are
not public.`,
  },
  {
    id: 'ai',
    title: 'LLM & agent surface',
    rows: [15],
    needs: 'llm',
    prompt: `Inventory every tool a model can call: name, file:line, arguments, what it touches, and the server-side
checks on it. Trace untrusted content into prompts (uploads, emails, web pages, issue text, file names): can it
steer a tool with attacker-chosen arguments?

Hunt: tool arguments not validated server-side (path outside a base dir, URL host not allowlisted, object not
scoped to the caller), exfiltration through file, HTTP or database tools, SSRF to metadata endpoints, model
output rendered as HTML or written into trusted fields, unsafe parsing of model output, client-chosen model
names, no per-user cost limit or iteration cap, secrets in prompts or logs, prompt files loaded from writable
directories.`,
  },
];
