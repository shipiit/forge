import { PROVIDERS as PROVIDER_META } from "../providers";

export const PROVIDER_OPTIONS = PROVIDER_META.map((p) => ({
  value: p.id,
  label: p.label,
  hint: p.hint,
}));

export const SKILLS = [
  {
    value: "",
    label: "All capabilities",
    hint: "Respond to every trigger — fix, review, audit, mentions",
  },
  {
    value: "code-review",
    label: "/code-review",
    hint: "Correctness and security, scoped to the change",
  },
  {
    value: "fix-issue",
    label: "/fix-issue",
    hint: "Investigate, fix, add tests, verify",
  },
  {
    value: "security-audit",
    label: "/security-audit",
    hint: "Source-to-sink vulnerability hunt",
  },
  {
    value: "commit-summary",
    label: "/commit-summary",
    hint: "Summarize one commit for the history",
  },
  {
    value: "pr-description",
    label: "/pr-description",
    hint: "A reviewer-focused PR body",
  },
  {
    value: "document",
    label: "/document",
    hint: "Write or update documentation",
  },
  { value: "triage", label: "/triage", hint: "Diagnose without touching code" },
  { value: "how-to", label: "/how-to", hint: "Answer how-do-I questions from the code" },
];

export const EVENTS = [
  { value: "issues", label: "issues" },
  { value: "issue_comment", label: "issue_comment" },
  { value: "pull_request", label: "pull_request" },
  { value: "pull_request_review_comment", label: "review_comment" },
  { value: "check_suite", label: "check_suite" },
  { value: "release", label: "release" },
];

export const TOOLS = [
  "read_file",
  "search",
  "glob",
  "list_dir",
  "git_history",
  "read_image",
  "run_tests",
  "run_bash",
].map((t) => ({ value: t, label: t }));

export const SECTION_LABELS = [
  "Basics",
  "When it runs",
  "Branches & docs",
  "Review & security",
  "What it does",
  "Limits & identity",
];

/** Which section each validated field belongs to, so a tab can flag itself. */
export const FIELD_SECTION: Record<string, number> = {
  name: 0,
  provider: 0,
  secretName: 0,
  VERTEX_PROJECT: 0,
  AWS_REGION: 0,
  GROQ_API_KEY: 0,
  TOGETHER_API_KEY: 0,
  OPENAI_COMPATIBLE_BASE_URL: 0,
  OPENAI_COMPATIBLE_MODEL: 0,
  events: 1,
  schedule: 1,
  routineName: 1,
  historyPath: 2,
  historyBranches: 2,
  auditSkills: 3,
  maxTurns: 5,
  maxOutputTokens: 5,
};
