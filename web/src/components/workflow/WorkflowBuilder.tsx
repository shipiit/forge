import { useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import { FormTabs } from "../form/FormTabs";
import { WorkflowFiles } from "./WorkflowFiles";
import { DEFAULT_CONFIG, generateAgentYml, generateWorkflow, validate, type WorkflowConfig } from "./generateWorkflow";
import { providerMeta } from "./providers";
import { FIELD_SECTION, SECTION_LABELS } from "./builder/options";
import { BasicsGroup } from "./builder/BasicsGroup";
import { WhenGroup } from "./builder/WhenGroup";
import { BranchesGroup } from "./builder/BranchesGroup";
import { ReviewGroup } from "./builder/ReviewGroup";
import { WhatGroup } from "./builder/WhatGroup";
import { LimitsGroup } from "./builder/LimitsGroup";
import { BuilderGuide } from "./builder/BuilderGuide";

/** The workflow builder: answers on the left, the generated files on the right. */
export function WorkflowBuilder() {
  const [c, setC] = useState<WorkflowConfig>(DEFAULT_CONFIG);
  const [edited, setEdited] = useState<string | null>(null);
  const [editedAgent, setEditedAgent] = useState<string | null>(null);

  const set = <K extends keyof WorkflowConfig>(key: K, value: WorkflowConfig[K]) => setC((prev) => ({ ...prev, [key]: value }));

  const yaml = useMemo(() => generateWorkflow(c), [c]);
  const agentYml = useMemo(() => generateAgentYml(c), [c]);
  const issues = useMemo(() => validate(c), [c]);
  const invalid = (field: string) => issues.some((i) => i.field === field);

  // Switching provider resets the credential fields — the previous provider's
  // secret name and env vars are meaningless for the new one.
  const onProvider = (provider: string) =>
    setC((prev) => ({ ...prev, provider, secretName: providerMeta(provider).defaultSecret, env: {} }));
  const setEnv = (name: string, value: string) => setC((prev) => ({ ...prev, env: { ...prev.env, [name]: value } }));

  const invalidSections = useMemo(() => [...new Set(issues.map((i) => FIELD_SECTION[i.field] ?? 0))], [issues]);
  const completeSections = useMemo(
    () => SECTION_LABELS.map((_, i) => i).filter((i) => !invalidSections.includes(i)),
    [invalidSections],
  );
  const groupProps = { c, set, invalid };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
      <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
        <FormTabs labels={SECTION_LABELS} invalid={invalidSections} complete={completeSections}>
          <BasicsGroup {...groupProps} onProvider={onProvider} setEnv={setEnv} />
          <WhenGroup {...groupProps} />
          <BranchesGroup {...groupProps} />
          <ReviewGroup {...groupProps} />
          <WhatGroup {...groupProps} />
          <LimitsGroup {...groupProps} />
        </FormTabs>

        {issues.length > 0 && (
          <div role="status" className="flex gap-3 border border-amber-400/25 bg-amber-400/[0.05] px-4 py-3.5">
            <AlertCircle size={16} className="mt-0.5 shrink-0 text-amber-200/90" aria-hidden />
            <div>
              <p className="text-[13px] font-semibold text-amber-100/90">
                {issues.length} thing{issues.length === 1 ? "" : "s"} still needed
              </p>
              <ul className="mt-1.5 space-y-1">
                {issues.map((i) => (
                  <li key={i.field} className="text-[12.5px] leading-relaxed text-muted">
                    {i.message}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </form>

      <div className="space-y-4">
        <WorkflowFiles
          files={[
            {
              id: "workflow",
              name: "forge.yml",
              path: ".github/workflows/",
              content: yaml,
              purpose: "The workflow — when Forge runs.",
              action: "Commit it to .github/workflows/ and GitHub starts calling the Action on those events.",
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
          guide={<BuilderGuide c={c} hasAgentYml={Boolean(agentYml)} />}
        />
      </div>
    </div>
  );
}
