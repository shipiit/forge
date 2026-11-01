import { Field } from "../../form/Field";
import { TextInput } from "../../form/TextInput";
import { Select } from "../../form/Select";
import { Toggle } from "../../form/Toggle";
import { Group } from "./Group";
import type { GroupProps } from "./types";

export function BranchesGroup({ c, set, invalid }: GroupProps) {
  return (
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
                  invalid={invalid("historyBranches")}
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
                  invalid={invalid("historyPath")}
                />
              </Field>
            </>
          )}
        </Group>
  );
}
