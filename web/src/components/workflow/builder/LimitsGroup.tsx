import { Field } from "../../form/Field";
import { TextInput } from "../../form/TextInput";
import { Select } from "../../form/Select";
import { Toggle } from "../../form/Toggle";
import { Group } from "./Group";
import type { GroupProps } from "./types";

export function LimitsGroup({ c, set, invalid }: GroupProps) {
  return (
        <Group title="Limits & identity">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Max turns" hint="Default 25." htmlFor="wb-turns">
              <TextInput
                id="wb-turns"
                mono
                value={c.maxTurns}
                onChange={(v) => set("maxTurns", v)}
                placeholder="25"
                invalid={invalid("maxTurns")}
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
                invalid={invalid("maxOutputTokens")}
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
            label="Action version"
            required
            hint="v2 is current and moves forward with each 2.x release. v1 predates skills, tool allowlists, per-run limits and change history."
            htmlFor="wb-ref"
          >
            <Select
              id="wb-ref"
              value={c.actionRef}
              options={[
                { value: "v2", label: "@v2", hint: "Current release — every input on this page" },
                { value: "v1", label: "@v1", hint: "Previous major — ignores the newer inputs" },
                { value: "main", label: "@main", hint: "Unreleased, moves with the branch" },
              ]}
              onChange={(v) => set("actionRef", v)}
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
  );
}
