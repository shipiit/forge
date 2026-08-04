import { describe, it, expect } from 'vitest';
import { iacScanner } from '../../src/scan/iac.js';

const scan = (path: string, text: string) => iacScanner.scan({ path, text }, { cwd: '.' });
const ids = (path: string, text: string) => scan(path, text).map((f) => f.title);

describe('Dockerfiles', () => {
  it('flags running as root, an unpinned base, and a remote ADD', () => {
    const df = ['FROM node:latest', 'ADD https://example.com/tool.sh /tool.sh', 'USER root'].join('\n');
    const found = ids('Dockerfile', df);
    expect(found).toContain('Container runs as root');
    expect(found).toContain('Base image pinned to :latest');
    expect(found).toContain('ADD ADD fetches a remote URL into the image'.replace('ADD ADD', 'ADD'));
  });

  it('says nothing about a well-formed one', () => {
    const df = ['FROM node:22.15.0-alpine', 'COPY . /app', 'USER node', 'CMD ["node", "dist/index.js"]'].join('\n');
    expect(scan('Dockerfile', df)).toHaveLength(0);
  });
});

describe('workflows', () => {
  it('catches untrusted event text reaching a shell', () => {
    // The classic: an issue title is written by whoever opened it, and ${{ }}
    // substitutes it before the shell sees it.
    const wf = ['jobs:', '  a:', '    steps:', '      - run: echo "${{ github.event.issue.title }}"'].join('\n');
    const found = scan('.github/workflows/ci.yml', wf);
    expect(found.map((f) => f.title)).toContain('Untrusted event text interpolated into a shell command');
    expect(found[0]!.severity).toBe('critical');
  });

  it('catches pull_request_target', () => {
    expect(ids('.github/workflows/ci.yml', 'on:\n  pull_request_target:\n    types: [opened]')).toContain(
      'Workflow triggers on pull_request_target',
    );
  });

  it('treats a version tag as a mutable ref, and a SHA as a pin', () => {
    expect(ids('.github/workflows/ci.yml', '      - uses: actions/checkout@v4')).toContain(
      'Action pinned to a mutable ref',
    );
    expect(ids('.github/workflows/ci.yml', '      - uses: actions/checkout@8f4b7f8')).not.toContain(
      'Action pinned to a mutable ref',
    );
  });

  it('does not flag a local action', () => {
    // `uses: ./` is this repository's own code — there is nothing to pin to.
    expect(ids('.github/workflows/ci.yml', '      - uses: ./')).toHaveLength(0);
  });
});

describe('terraform and kubernetes', () => {
  it('flags a security group open to the internet on a non-web port', () => {
    const tf = 'ingress {\n  from_port = 22\n  cidr_blocks = ["0.0.0.0/0"]\n}';
    expect(ids('main.tf', tf)).toContain('Security group open to the whole internet');
  });

  it('allows 0.0.0.0/0 where it is the point', () => {
    const tf = 'ingress {\n  cidr_blocks = ["0.0.0.0/0"] # 443 public site\n}';
    expect(ids('main.tf', tf)).not.toContain('Security group open to the whole internet');
  });

  it('flags a public bucket and disabled encryption', () => {
    expect(ids('s3.tf', 'acl = "public-read"')).toContain('Storage bucket is publicly readable');
    expect(ids('db.tf', '  storage_encrypted = false')).toContain('Encryption at rest explicitly disabled');
  });

  it('flags privileged pods and host mounts', () => {
    expect(ids('deploy.yaml', '        securityContext:\n          privileged: true')).toContain('Privileged pod');
    expect(ids('deploy.yaml', '      volumes:\n        - hostPath:\n            path: /var/run')).toContain(
      'Pod mounts a host path',
    );
  });
});

describe('which files it opens at all', () => {
  it('handles infrastructure files and ignores source', () => {
    for (const p of ['Dockerfile', '.github/workflows/ci.yml', 'main.tf', 'k8s/deploy.yaml']) {
      expect(iacScanner.handles(p), p).toBe(true);
    }
    for (const p of ['src/index.ts', 'README.md', 'package.json']) {
      expect(iacScanner.handles(p), p).toBe(false);
    }
  });
});
