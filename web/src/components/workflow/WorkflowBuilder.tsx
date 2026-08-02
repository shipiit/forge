import { useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import { Field } from "../form/Field";
import { TextInput, TextArea } from "../form/TextInput";
import { Select } from "../form/Select";
import { Toggle, ChipGroup } from "../form/Toggle";
import { FormTabs } from "../form/FormTabs";
import { WorkflowFiles } from "./WorkflowFiles";
import {
  DEFAULT_CONFIG,
  generateAgentYml,
  generateWorkflow,
  validate,
  type WorkflowConfig,
} from "./generateWorkflow";
import { PROVIDERS as PROVIDER_META, providerMeta } from "./providers";

const PROVIDER_OPTIONS = PROVIDER_META.map((p) => ({
  value: p.id,
  label: p.label,
  hint: p.hint,
}));

const SKILLS = [
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
];

const EVENTS = [
  { value: "issues", label: "issues" },
  { value: "issue_comment", label: "issue_comment" },
  { value: "pull_request", label: "pull_request" },
  { value: "pull_request_review_comment", label: "review_comment" },
  { value: "check_suite", label: "check_suite" },
  { value: "release", label: "release" },
];

const TOOLS = [
  "read_file",
  "search",
  "glob",
  "list_dir",
  "git_history",
  "read_image",
  "run_tests",
  "run_bash",
].map((t) => ({ value: t, label: t }));

const SECTION_LABELS = [
  "Basics",
  "When it runs",
  "Branches & docs",
  "What it does",
  "Limits & identity",
];

/** Which section each validated field belongs to, so a tab can flag itself. */
const FIELD_SECTION: Record<string, number> = {
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
  maxTurns: 4,
  maxOutputTokens: 4,
};

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="rounded-xl border border-white/[0.08] bg-white/[0.015] p-5">
      <legend className="px-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
        {title}
      </legend>
      <div className="mt-3 space-y-5">{children}</div>
    </fieldset>
  );
}

export function WorkflowBuilder() {
  const [c, setC] = useState<WorkflowConfig>(DEFAULT_CONFIG);
  const [edited, setEdited] = useState<string | null>(null);
  const [editedAgent, setEditedAgent] = useState<string | null>(null);

  const set = <K extends keyof WorkflowConfig>(
    key: K,
    value: WorkflowConfig[K],
  ) => setC((prev) => ({ ...prev, [key]: value }));

  const yaml = useMemo(() => generateWorkflow(c), [c]);
  const agentYml = useMemo(() => generateAgentYml(c), [c]);
  const issues = useMemo(() => validate(c), [c]);
  const issueFor = (f: string) => issues.find((i) => i.field === f);
  const meta = providerMeta(c.provider);

  // Switching provider resets the credential fields — the previous provider's
  // secret name and env vars are meaningless for the new one.
  const onProvider = (provider: string) =>
    setC((prev) => ({
      ...prev,
      provider,
      secretName: providerMeta(provider).defaultSecret,
      env: {},
    }));

  const invalidSections = useMemo(
    () => [...new Set(issues.map((i) => FIELD_SECTION[i.field] ?? 0))],
    [issues],
  );
  const completeSections = useMemo(
    () => SECTION_LABELS.map((_, i) => i).filter((i) => !invalidSections.includes(i)),
    [invalidSections],
  );

  const setEnv = (name: string, value: string) =>
    setC((prev) => ({ ...prev, env: { ...prev.env, [name]: value } }));

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
      {/* ---------------------------------------------------------- form */}
      <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
        <FormTabs
          labels={SECTION_LABELS}
          invalid={invalidSections}
          complete={completeSections}
        >
        <Group title="Basics">
          <Field
            label="Workflow name"
            required
            hint="Shown in the Actions tab."
            htmlFor="wb-name"
          >
            <TextInput
              id="wb-name"
              value={c.name}
              onChange={(v) => set("name", v)}
              placeholder="ShipIT Forge"
              invalid={Boolean(issueFor("name"))}
            />
          </Field>

          <Field
            label="Provider"
            required
            hint="Which model answers. Swap it any time."
            htmlFor="wb-provider"
          >
            <Select
              id="wb-provider"
              value={c.provider}
              options={PROVIDER_OPTIONS}
              onChange={onProvider}
            />
          </Field>

          <Field
            label="Model"
            hint={
              meta.defaultModel
                ? `Leave empty to use ${meta.label}'s default (${meta.defaultModel}).`
                : `${meta.label} has no default model — set one here or in the env below.`
            }
            htmlFor="wb-model"
          >
            <TextInput
              id="wb-model"
              mono
              value={c.model}
              onChange={(v) => set("model", v)}
              placeholder={meta.defaultModel || "our-model-v2"}
            />
          </Field>

          {meta.secretInput && (
            <Field
              label="Secret name"
              required
              hint={`The secret holding your ${meta.label} credential. The name, never the key itself.`}
              htmlFor="wb-secret"
            >
              <TextInput
                id="wb-secret"
                mono
                value={c.secretName}
                onChange={(v) => set("secretName", v)}
                invalid={Boolean(issueFor("secretName"))}
              />
            </Field>
          )}

          {meta.credentialNote && (
            <p className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3.5 py-3 text-[12.5px] leading-relaxed text-muted">
              {meta.credentialNote}
            </p>
          )}

          {meta.extraEnv.map((e) => (
            <Field
              key={e.name}
              label={e.label}
              required={e.required}
              hint={`${e.hint} Emitted as ${e.name}.`}
              htmlFor={`wb-env-${e.name}`}
            >
              <TextInput
                id={`wb-env-${e.name}`}
                mono
                value={c.env[e.name] ?? ""}
                onChange={(v) => setEnv(e.name, v)}
                placeholder={e.placeholder}
                invalid={Boolean(issueFor(e.name))}
              />
            </Field>
          ))}
        </Group>

        <Group title="When it runs">
          <Field
            label="Events"
            required
            hint="What starts the agent. At least one, or a schedule below."
          >
            <ChipGroup
              ariaLabel="Trigger events"
              options={EVENTS}
              selected={c.events}
              onChange={(v) => set("events", v)}
            />
          </Field>

          <Field
            label="Schedule"
            hint="Optional cron, in UTC. Also adds a Run workflow button in the Actions tab."
            htmlFor="wb-cron"
          >
            <TextInput
              id="wb-cron"
              mono
              value={c.schedule}
              onChange={(v) => set("schedule", v)}
              placeholder="0 9 * * *"
              invalid={Boolean(issueFor("schedule"))}
            />
          </Field>

          {c.schedule.trim() && (
            <Field
              label="Routine name"
              required
              hint="Names the scheduled job so you can also start it on demand with /run <name>."
              htmlFor="wb-routine"
            >
              <TextInput
                id="wb-routine"
                mono
                value={c.routineName}
                onChange={(v) => set("routineName", v)}
                placeholder="nightly-digest"
                invalid={Boolean(issueFor("routineName"))}
              />
            </Field>
          )}
        </Group>

        <Group title="Branches & documentation">
          <Field
            label="Only act on PRs targeting"
            hint="Comma separated. Leave empty to act on every pull request, whatever it targets."
            htmlFor="wb-base"
          >
            <TextInput
              id="wb-base"
              mono
              value={c.baseBranches}
              onChange={(v) => set("baseBranches", v)}
              placeholder="main, develop"
            />
          </Field>

          <Toggle
            checked={c.history}
            onChange={(v) => set("history", v)}
            label="Document every commit"
            hint="On each merge or push to the branches below, write one history entry from that change's diff — opened as a PR, never pushed to the branch."
          />

          {c.history && (
            <>
              <Field
                label="Branches to document"
                required
                hint="Commits landing here get a history entry. Add develop to document your integration branch too."
                htmlFor="wb-hbranches"
              >
                <TextInput
                  id="wb-hbranches"
                  mono
                  value={c.historyBranches}
                  onChange={(v) => set("historyBranches", v)}
                  placeholder="main, develop"
                  invalid={Boolean(issueFor("historyBranches"))}
                />
              </Field>

              <Field
                label="How to store it"
                required
                hint="One running document, or a new file per change named after it."
                htmlFor="wb-hmode"
              >
                <Select
                  id="wb-hmode"
                  value={c.historyMode}
                  options={[
                    {
                      value: "single",
                      label: "One running document",
                      hint: "Newest entry on top of a single file",
                    },
                    {
                      value: "per_commit",
                      label: "A file per change",
                      hint: "2026-08-02-add-caching-pr-128.md in a directory",
                    },
                  ]}
                  onChange={(v) => set("historyMode", v as "single" | "per_commit")}
                />
              </Field>

              <Field
                label={c.historyMode === "per_commit" ? "Directory" : "Document path"}
                required
                hint={
                  c.historyMode === "per_commit"
                    ? "The per-change files are written here, one per commit or merged PR."
                    : "Where the running history lives. It is created on the first entry."
                }
                htmlFor="wb-hpath"
              >
                <TextInput
                  id="wb-hpath"
                  mono
                  value={c.historyPath}
                  onChange={(v) => set("historyPath", v)}
                  placeholder={c.historyMode === "per_commit" ? "docs/history" : "docs/CHANGE-HISTORY.md"}
                  invalid={Boolean(issueFor("historyPath"))}
                />
              </Field>
            </>
          )}
        </Group>

        <Group title="What it does">
          <Field
            label="Pin this workflow to one skill"
            hint="One per workflow — it decides what this job does every time it runs. Leave it on “All capabilities” for the normal setup."
            htmlFor="wb-skill"
          >
            <Select
              id="wb-skill"
              value={c.skill}
              options={SKILLS}
              onChange={(v) => set("skill", v)}
            />
          </Field>

          <p className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3.5 py-3 text-[12.5px] leading-relaxed text-muted">
            <span className="text-text">
              Every skill stays available regardless.
            </span>{" "}
            Pinning one only changes what this job does on its own triggers —
            anyone can still comment{" "}
            <code className="text-[rgb(var(--syn-keyword))]">/code-review</code>
            , <code className="text-[rgb(var(--syn-keyword))]">/triage</code>,
            or any other skill on an issue or PR. To run two skills
            automatically, add a second job with its own triggers.
          </p>

          <Field
            label="Extra instructions"
            hint="Appended to the system prompt, taking precedence over the defaults."
            htmlFor="wb-prompt"
          >
            <TextArea
              id="wb-prompt"
              value={c.prompt}
              onChange={(v) => set("prompt", v)}
              placeholder={
                "Reserve Important for anything that would break behaviour.\nNever report what CI already enforces."
              }
            />
          </Field>

          <Field
            label="Tool allowlist"
            hint="Fewer tools means fewer tokens on every turn. Empty means all."
          >
            <ChipGroup
              ariaLabel="Allowed tools"
              options={TOOLS}
              selected={c.allowedTools}
              onChange={(v) => set("allowedTools", v)}
            />
          </Field>
        </Group>

        <Group title="Limits & identity">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Max turns" hint="Default 25." htmlFor="wb-turns">
              <TextInput
                id="wb-turns"
                mono
                value={c.maxTurns}
                onChange={(v) => set("maxTurns", v)}
                placeholder="25"
                invalid={Boolean(issueFor("maxTurns"))}
              />
            </Field>
            <Field
              label="Output tokens"
              hint="Default 16384."
              htmlFor="wb-tokens"
            >
              <TextInput
                id="wb-tokens"
                mono
                value={c.maxOutputTokens}
                onChange={(v) => set("maxOutputTokens", v)}
                placeholder="16384"
                invalid={Boolean(issueFor("maxOutputTokens"))}
              />
            </Field>
            <Field label="Max nits" hint="Default 5." htmlFor="wb-nits">
              <TextInput
                id="wb-nits"
                mono
                value={c.maxNits}
                onChange={(v) => set("maxNits", v)}
                placeholder="5"
              />
            </Field>
          </div>

          <Field
            label="Trigger phrase"
            hint="The mention handle. Default @shipit-forge."
            htmlFor="wb-phrase"
          >
            <TextInput
              id="wb-phrase"
              mono
              value={c.triggerPhrase}
              onChange={(v) => set("triggerPhrase", v)}
              placeholder="@our-bot"
            />
          </Field>

          <Field
            label="Job timeout"
            hint="Minutes before the job is cancelled."
            htmlFor="wb-timeout"
          >
            <TextInput
              id="wb-timeout"
              mono
              value={c.timeout}
              onChange={(v) => set("timeout", v)}
              placeholder="30"
            />
          </Field>

          <div className="space-y-2.5">
            <Toggle
              checked={c.promptCache}
              onChange={(v) => set("promptCache", v)}
              label="Prompt caching"
              hint="Leave on — the single biggest cost lever."
            />
            <Toggle
              checked={c.concurrency}
              onChange={(v) => set("concurrency", v)}
              label="Concurrency group"
              hint="One run per issue or PR thread."
            />
            <Toggle
              checked={c.useApp}
              onChange={(v) => set("useApp", v)}
              label="Commit as your own GitHub App"
              hint="A branded bot identity — and its commits retrigger your CI, which the default token's do not."
            />
          </div>
        </Group>
        </FormTabs>

        {issues.length > 0 && (
          <div
            role="status"
            className="flex gap-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.05] px-4 py-3.5"
          >
            <AlertCircle
              size={16}
              className="mt-0.5 shrink-0 text-amber-200/90"
            />
            <div>
              <p className="text-[13px] font-semibold text-amber-100/90">
                {issues.length} thing{issues.length === 1 ? "" : "s"} still
                needed
              </p>
              <ul className="mt-1.5 space-y-1">
                {issues.map((i) => (
                  <li
                    key={i.field}
                    className="text-[12.5px] leading-relaxed text-muted"
                  >
                    {i.message}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </form>

      {/* ------------------------------------------------------- preview */}
      <div className="space-y-4">
        <WorkflowFiles
          files={[
            {
              id: "workflow",
              name: "forge.yml",
              path: ".github/workflows/",
              content: yaml,
              purpose: "The workflow — when Forge runs.",
              action:
                "Commit it to .github/workflows/ and GitHub starts calling the Action on those events.",
              edited,
              onEdit: setEdited,
            },
            ...(agentYml
              ? [
                  {
                    id: "agent",
                    name: "agent.yml",
                    path: ".github/",
                    content: agentYml,
                    purpose: "The configuration — what Forge does.",
                    action:
                      "Commit it to .github/ alongside the workflow. It holds the routines, the change-history settings, and the filters.",
                    edited: editedAgent,
                    onEdit: setEditedAgent,
                  },
                ]
              : []),
          ]}
          guide={
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
              <h4 className="text-[13px] font-semibold text-text">
                Where each file goes
              </h4>
              <ol className="mt-3 space-y-2.5 text-[12.5px] leading-relaxed text-muted">
                <li className="flex gap-2.5">
                  <span className="text-white/40">1</span>
                  <span>
                    Commit the workflow as{" "}
                    <code className="text-[rgb(var(--syn-keyword))]">
                      .github/workflows/forge.yml
                    </code>
                    .
                  </span>
                </li>
                {agentYml && (
                  <li className="flex gap-2.5">
                    <span className="text-white/40">2</span>
                    <span>
                      Commit the routine as{" "}
                      <code className="text-[rgb(var(--syn-keyword))]">
                        .github/agent.yml
                      </code>
                      . The workflow says{" "}
                      <em className="not-italic text-text">when</em>; the
                      routine says{" "}
                      <em className="not-italic text-text">what</em>.
                    </span>
                  </li>
                )}
                <li className="flex gap-2.5">
                  <span className="text-white/40">{agentYml ? 3 : 2}</span>
                  <span>
                    Add your key under{" "}
                    <span className="text-text">
                      Settings → Secrets and variables → Actions
                    </span>{" "}
                    {meta.secretInput ? (
                      <>
                        as{" "}
                        <code className="text-[rgb(var(--syn-keyword))]">
                          {c.secretName || "YOUR_SECRET"}
                        </code>
                        .
                      </>
                    ) : (
                      <>— see the note above for what this provider needs.</>
                    )}
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span className="text-white/40">{agentYml ? 4 : 3}</span>
                  <span>
                    {c.schedule.trim() ? (
                      <>
                        Run it on demand from{" "}
                        <span className="text-text">
                          Actions → {c.name || "ShipIT Forge"} → Run workflow
                        </span>
                        , or comment{" "}
                        <code className="text-[rgb(var(--syn-keyword))]">
                          /run {c.routineName || "nightly-digest"}
                        </code>{" "}
                        in any issue or PR. It also fires on its schedule.
                      </>
                    ) : (
                      <>
                        Open an issue or a pull request — Forge responds on the
                        events you selected. Comment{" "}
                        <code className="text-[rgb(var(--syn-keyword))]">
                          /fix
                        </code>{" "}
                        or{" "}
                        <code className="text-[rgb(var(--syn-keyword))]">
                          /review
                        </code>{" "}
                        to ask for something directly.
                      </>
                    )}
                  </span>
                </li>
              </ol>
            </div>
          }
        />
      </div>
    </div>
  );
}
