import { Field } from "../../form/Field";
import { TextInput } from "../../form/TextInput";
import { Select } from "../../form/Select";
import { Toggle } from "../../form/Toggle";
import type { WorkflowConfig } from "../generateWorkflow";
import { Group } from "./Group";
import type { GroupProps } from "./types";

const DEPTHS: Array<{ value: WorkflowConfig["reviewDepth"]; label: string; hint: string }> = [
  { value: "standard", label: "Standard", hint: "One reviewer, then a verifier drops what the code does not bear out" },
  { value: "light", label: "Light", hint: "One reviewer, posted as found — cheapest" },
  { value: "deep", label: "Deep", hint: "Three focused reviewers, then the verifier — about 3–4× standard" },
];

const BLOCK_ON: Array<{ value: WorkflowConfig["scanBlockOn"]; label: string; hint: string }> = [
  { value: "high", label: "High and above", hint: "The default: real problems stop a merge" },
  { value: "critical", label: "Critical only", hint: "Block only on the worst" },
  { value: "medium", label: "Medium and above", hint: "Stricter" },
  { value: "low", label: "Low and above", hint: "Every finding must be resolved or dismissed" },
  { value: "none", label: "Never block", hint: "Report only" },
];

function isDepth(v: string): v is WorkflowConfig["reviewDepth"] {
  return DEPTHS.some((d) => d.value === v);
}

function isBlockOn(v: string): v is WorkflowConfig["scanBlockOn"] {
  return BLOCK_ON.some((b) => b.value === v);
}

export function ReviewGroup({ c, set, invalid }: GroupProps) {
  return (
    <Group title="Review & security">
      <Field
        label="Review depth"
        hint="How hard each pull request is looked at. Reviews only ever read the pull request's own changes."
        htmlFor="wb-depth"
      >
        <Select id="wb-depth" value={c.reviewDepth} options={DEPTHS} onChange={(v) => isDepth(v) && set("reviewDepth", v)} />
      </Field>

      <Field
        label="Scan check fails at"
        hint="The deterministic scan's check run. Make it a required check to gate merges."
        htmlFor="wb-blockon"
      >
        <Select id="wb-blockon" value={c.scanBlockOn} options={BLOCK_ON} onChange={(v) => isBlockOn(v) && set("scanBlockOn", v)} />
      </Field>

      <div className="space-y-2.5">
        <Toggle
          checked={c.depScan}
          onChange={(v) => set("depScan", v)}
          label="Check dependencies"
          hint="Packages a lockfile change adds or upgrades, against OSV.dev: CVEs, malicious releases, new install scripts."
        />
        <Toggle
          checked={c.externalScanners}
          onChange={(v) => set("externalScanners", v)}
          label="Bundled scanners on /audit"
          hint="semgrep, gitleaks, trivy, osv-scanner, bandit and checkov. They never see your token or keys."
        />
      </div>

      <Field
        label="Audit skills"
        hint="Optional. /audit's specialist slices from a repository, pinned to a full commit SHA — for example shipiit/pentest-skills."
        htmlFor="wb-auditskills"
      >
        <TextInput
          id="wb-auditskills"
          mono
          value={c.auditSkills}
          onChange={(v) => set("auditSkills", v)}
          placeholder="owner/repo@<40-character commit SHA>"
          invalid={invalid("auditSkills")}
        />
      </Field>
    </Group>
  );
}
