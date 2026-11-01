import { Field } from "../../form/Field";
import { TextInput } from "../../form/TextInput";
import { ChipGroup } from "../../form/Toggle";
import { EVENTS } from "./options";
import { Group } from "./Group";
import type { GroupProps } from "./types";

export function WhenGroup({ c, set, invalid }: GroupProps) {
  return (
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
              invalid={invalid("schedule")}
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
                invalid={invalid("routineName")}
              />
            </Field>
          )}
        </Group>
  );
}
