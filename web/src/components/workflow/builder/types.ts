import type { WorkflowConfig } from "../generateWorkflow";

/** What every form group gets: the answers so far, a setter, and the validation for a field. */
export interface GroupProps {
  c: WorkflowConfig;
  set: <K extends keyof WorkflowConfig>(key: K, value: WorkflowConfig[K]) => void;
  invalid: (field: string) => boolean;
}
