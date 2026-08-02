import { Target } from 'lucide-react';
import { Code } from '../../components/Code';
import { Tabs } from '../../components/Tabs';
import { Section, Triggers } from '../../components/GuideBits';

const EVENTS: [string, string][] = [
  ['pull_request.opened', 'A pull request is opened.'],
  ['pull_request.synchronize', 'New commits are pushed to an open pull request.'],
  ['pull_request.closed', 'A pull request closes — filter on is_merged for merges only.'],
  ['push', 'Commits land on a branch. Pair with a branch filter.'],
  ['release.published', 'A release goes out.'],
  ['issues.opened', 'A new issue is filed.'],
];

export function EventsSection() {
  return (
    <Section
      id="events"
      Icon={Target}
      eyebrow="Event triggers"
      title="Run automatically on repository events"
      lead="A routine can react to activity as it happens — a pull request opened, commits pushed, a release published — with the same filter set the reviewer uses. Combine it with a schedule and the same routine covers both."
    >
      <Tabs
        ariaLabel="Event triggers"
        tabs={[
          {
            id: 'events',
            label: 'Supported events',
            hint: 'Name the bare event to catch every action, or qualify it to catch one.',
            content: <Triggers rows={EVENTS} />,
          },
          {
            id: 'config',
            label: 'Configure',
            hint: 'events: decides what fires it; filters: narrow which of those actually run.',
            content: (
              <Code
                label=".github/agent.yml"
                lang="yaml"
                code={`routines:
  # Document every merge into main.
  - name: record-merge
    skill: commit-summary
    events: [pull_request.closed]
    filters:
      - { field: is_merged,   operator: equals, value: true }
      - { field: base_branch, operator: equals, value: main }

  # Deep review, but only on PRs touching auth.
  - name: auth-review
    skill: security-audit
    events: [pull_request.opened, pull_request.synchronize]
    filters:
      - { field: head_branch, operator: contains, value: auth }
      - { field: is_draft,    operator: equals,   value: false }

  # Release notes when a release goes out.
  - name: release-notes
    skill: document
    events: [release.published]`}
              />
            ),
          },
          {
            id: 'workflow',
            label: 'The workflow side',
            hint: 'The Action only sees events the workflow subscribes to — list them here as well.',
            content: (
              <Code
                label=".github/workflows/forge.yml"
                lang="yaml"
                code={`on:
  pull_request: { types: [opened, synchronize, closed] }
  push: { branches: [main, develop] }
  release: { types: [published] }
  issue_comment: { types: [created] }   # for /run and @mentions

permissions:
  contents: write
  pull-requests: write
  issues: write`}
              />
            ),
          },
          {
            id: 'combine',
            label: 'All three at once',
            hint: 'One routine, three ways in — nightly, on demand, and on every merge.',
            content: (
              <Code
                label=".github/agent.yml"
                lang="yaml"
                code={`routines:
  - name: digest
    skill: commit-summary
    prompt: Summarize what changed and flag anything a consumer would notice.

    schedule: "0 9 * * *"           # every morning
    manual: true                    # /run digest, any thread
    events: [pull_request.closed]   # and on every merge
    filters:
      - { field: is_merged, operator: equals, value: true }

    report: issue                   # scheduled runs open an issue
                                    # with their findings; set to
                                    # 'none' to keep it in the log`}
              />
            ),
          },
        ]}
      />

      <p className="mt-6 max-w-3xl text-sm leading-relaxed text-muted">
        <span className="text-text">Where the output goes.</span> Started from a comment, a routine replies in that
        thread. Fired by a schedule there is no thread, so it opens an issue with its findings — otherwise a nightly
        digest would only ever reach the Actions log. Set{' '}
        <code className="text-[rgb(var(--syn-keyword))]">report: none</code> if you would rather it stayed there.
      </p>
    </Section>
  );
}
