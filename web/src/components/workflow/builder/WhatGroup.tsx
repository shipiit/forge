import { Field } from "../../form/Field";
import { TextArea } from "../../form/TextInput";
import { Select } from "../../form/Select";
import { ChipGroup } from "../../form/Toggle";
import { SKILLS, TOOLS } from "./options";
import { Group } from "./Group";
import type { GroupProps } from "./types";

export function WhatGroup({ c, set }: GroupProps) {
  return (
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
  );
}
