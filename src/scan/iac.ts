import type { ReviewFinding } from '../github/review.js';
import type { ScanFile, Scanner } from './types.js';

/**
 * Infrastructure and CI configuration.
 *
 * These files decide what the application runs as and what its pipeline is
 * allowed to do, and they get far less review than application code — a widened
 * permission in a workflow reads as one word in a diff. Everything here is a
 * shape, not a judgement: no model call, same answer every time.
 */

interface Rule {
  id: string;
  applies: RegExp;
  match: RegExp;
  /** Suppress when this also matches the line — the mitigation. */
  unless?: RegExp;
  severity: ReviewFinding['severity'];
  category: string;
  title: string;
  body: string;
}

const DOCKERFILE = /(?:^|\/)(?:Dockerfile|Containerfile)(?:\.\w+)?$/i;
const WORKFLOW = /\.github\/workflows\/[^/]+\.ya?ml$/;
const KUBERNETES = /\.ya?ml$/;
const TERRAFORM = /\.tf$/;
const COMPOSE = /docker-compose(?:\.\w+)?\.ya?ml$/;

const RULES: Rule[] = [
  {
    id: 'docker-root',
    applies: DOCKERFILE,
    match: /^\s*USER\s+(?:root|0)\s*$/im,
    severity: 'medium',
    category: 'CWE-250',
    title: 'Container runs as root',
    body:
      'The image explicitly drops back to root. A process that is compromised then owns the whole ' +
      'container, and on a shared kernel that is the first step out of it. Add a non-root user and ' +
      'switch to it as the last USER instruction.',
  },
  {
    id: 'docker-latest',
    applies: DOCKERFILE,
    match: /^\s*FROM\s+\S+:latest\b/im,
    severity: 'low',
    category: 'CWE-1104',
    title: 'Base image pinned to :latest',
    body:
      '`:latest` means the build is not reproducible and cannot be audited: the image that passed ' +
      'review is not necessarily the image that ships. Pin a version, or a digest if the registry ' +
      'is not yours.',
  },
  {
    id: 'docker-add-remote',
    applies: DOCKERFILE,
    match: /^\s*ADD\s+https?:\/\//im,
    severity: 'medium',
    category: 'CWE-494',
    title: 'ADD fetches a remote URL into the image',
    body:
      'ADD with a URL downloads at build time with no checksum and no TLS pinning, so whatever that ' +
      'host serves is what ends up in your image. Use RUN with an explicit fetch and a checksum, or ' +
      'vendor the file.',
  },
  {
    id: 'compose-privileged',
    applies: COMPOSE,
    match: /^\s*-?\s*privileged:\s*true\b/im,
    severity: 'high',
    category: 'CWE-250',
    title: 'Privileged container',
    body:
      'A privileged container has the host’s capabilities and device access. Escaping it is ' +
      'close to trivial, so this is effectively running on the host. Grant the specific capability ' +
      'instead.',
  },
  {
    id: 'k8s-privileged',
    applies: KUBERNETES,
    match: /^\s*-?\s*privileged:\s*true\b/im,
    severity: 'high',
    category: 'CWE-250',
    title: 'Privileged pod',
    body:
      'privileged: true gives the pod the host’s capabilities and devices. A compromise of this ' +
      'workload is a compromise of the node. Ask for the individual capability instead.',
  },
  {
    id: 'k8s-hostpath',
    applies: KUBERNETES,
    match: /^\s*-?\s*hostPath:\s*$/im,
    severity: 'medium',
    category: 'CWE-552',
    title: 'Pod mounts a host path',
    body:
      'A hostPath volume reaches the node’s filesystem from inside the pod. Depending on the ' +
      'path that is either a data leak or a way onto the node. Use a PersistentVolume or a ' +
      'projected volume unless the node path is the point.',
  },
  {
    id: 'tf-public-cidr',
    applies: TERRAFORM,
    match: /cidr_blocks\s*=\s*\[\s*"0\.0\.0\.0\/0"/i,
    unless: /(?:443|80)\b/,
    severity: 'high',
    category: 'CWE-284',
    title: 'Security group open to the whole internet',
    body:
      '0.0.0.0/0 on something other than a public web port exposes it to every host on the ' +
      'internet, including whatever scans it within the hour. Restrict to the addresses that need ' +
      'it, or put it behind a load balancer.',
  },
  {
    id: 'tf-public-bucket',
    applies: TERRAFORM,
    match: /acl\s*=\s*"public-read(?:-write)?"/i,
    severity: 'high',
    category: 'CWE-732',
    title: 'Storage bucket is publicly readable',
    body:
      'A public ACL makes every object in the bucket world-readable, including anything written to ' +
      'it later by code that assumed it was private. Serve public assets through a CDN with an ' +
      'explicit origin policy instead.',
  },
  {
    id: 'tf-unencrypted',
    applies: TERRAFORM,
    match: /^\s*(?:storage_encrypted|encrypted)\s*=\s*false\b/im,
    severity: 'medium',
    category: 'CWE-311',
    title: 'Encryption at rest explicitly disabled',
    body:
      'This turns off encryption that the provider gives away free. The cost of leaving it on is ' +
      'nothing; the cost of it being off is every compliance conversation you will have about this ' +
      'resource.',
  },
  {
    id: 'ci-mutable-action',
    applies: WORKFLOW,
    match: /^\s*-?\s*uses:\s*(?!\.\/)[\w-]+\/[\w.-]+@(?:main|master|v?\d+(?:\.\d+)?)\s*$/im,
    severity: 'medium',
    category: 'CWE-494',
    title: 'Action pinned to a mutable ref',
    body:
      'A tag or a branch is not a pin — whoever owns that action can change what it points at, and ' +
      'your job runs it with your secrets. Pin to a full commit SHA for anything outside your own ' +
      'organization.',
  },
  {
    id: 'ci-pull-request-target',
    applies: WORKFLOW,
    match: /^\s*pull_request_target\s*:/im,
    severity: 'high',
    category: 'CWE-284',
    title: 'Workflow triggers on pull_request_target',
    body:
      'pull_request_target runs with secrets and write permission on a pull request from anyone, ' +
      'including a fork. Combined with any checkout of the pull request’s code, it hands the ' +
      'repository to whoever opened it. If you need the trigger, never check out the head ref.',
  },
  {
    id: 'ci-script-injection',
    applies: WORKFLOW,
    match: /run:[\s\S]{0,400}?\$\{\{\s*github\.event\.(?:issue|pull_request|comment)\.[\w.]*(?:title|body|login|ref|label)/im,
    severity: 'critical',
    category: 'CWE-78',
    title: 'Untrusted event text interpolated into a shell command',
    body:
      'An issue title, a comment body or a branch name is written by whoever opened it, and ' +
      '`${{ }}` substitutes it into the script before the shell sees it. A title containing a shell ' +
      'metacharacter runs as a command on the runner, with the workflow token in the environment. ' +
      'Pass it through an `env:` variable and reference "$VAR" in the script instead.',
  },
];

export const iacScanner: Scanner = {
  name: 'iac',
  handles(path) {
    return DOCKERFILE.test(path) || WORKFLOW.test(path) || TERRAFORM.test(path) || COMPOSE.test(path) || KUBERNETES.test(path);
  },

  scan(file: ScanFile): ReviewFinding[] {
    const out: ReviewFinding[] = [];
    const lines = file.text.split('\n');

    for (const rule of RULES) {
      if (!rule.applies.test(file.path)) continue;
      // Whole-file first so multi-line patterns work, then locate the line.
      if (!rule.match.test(file.text)) continue;

      const single = new RegExp(rule.match.source, rule.match.flags.replace('m', '').replace('g', ''));
      const idx = lines.findIndex((l) => single.test(l));
      const line = idx >= 0 ? idx + 1 : 1;
      if (idx >= 0 && rule.unless?.test(lines[idx]!)) continue;

      out.push({
        file: file.path,
        startLine: line,
        endLine: line,
        lens: 'security',
        severity: rule.severity,
        category: rule.category,
        title: rule.title,
        body: rule.body,
      });
    }
    return out;
  },
};
