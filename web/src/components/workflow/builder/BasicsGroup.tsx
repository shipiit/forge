import { Field } from "../../form/Field";
import { TextInput } from "../../form/TextInput";
import { Select } from "../../form/Select";
import { providerMeta } from "../providers";
import { PROVIDER_OPTIONS } from "./options";
import { Group } from "./Group";
import type { GroupProps } from "./types";

export function BasicsGroup({ c, set, invalid, onProvider, setEnv }: GroupProps & { onProvider: (provider: string) => void; setEnv: (name: string, value: string) => void }) {
  const meta = providerMeta(c.provider);
  return (
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
              invalid={invalid("name")}
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
                invalid={invalid("secretName")}
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
                invalid={invalid(e.name)}
              />
            </Field>
          ))}
        </Group>
  );
}
