import type { WorkflowConfig } from './generateWorkflow';
import { branchList } from './agentYml';
import { providerMeta } from './providers';

export interface ValidationIssue {
  field: string;
  message: string;
}

/** Required fields, checked as the user types. */
export function validate(c: WorkflowConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const meta = providerMeta(c.provider);

  if (!c.name.trim()) issues.push({ field: 'name', message: 'The workflow needs a name.' });
  if (!c.provider) issues.push({ field: 'provider', message: 'Pick a provider.' });

  if (meta.secretInput && !c.secretName.trim()) {
    issues.push({ field: 'secretName', message: `Name the secret holding your ${meta.label} credential.` });
  }
  for (const e of meta.extraEnv) {
    if (e.required && !(c.env[e.name] ?? '').trim()) {
      issues.push({ field: e.name, message: `${meta.label} needs ${e.label} (${e.name}).` });
    }
  }

  if (c.events.length === 0 && !c.schedule.trim()) {
    issues.push({ field: 'events', message: 'Choose at least one event, or set a schedule.' });
  }
  if (c.maxTurns && !/^\d+$/.test(c.maxTurns)) {
    issues.push({ field: 'maxTurns', message: 'Max turns must be a whole number.' });
  }
  if (c.maxOutputTokens && !/^\d+$/.test(c.maxOutputTokens)) {
    issues.push({ field: 'maxOutputTokens', message: 'Token budget must be a whole number.' });
  }
  if (c.history) {
    if (!c.historyPath.trim()) {
      issues.push({ field: 'historyPath', message: 'The change-history document needs a path.' });
    }
    if (branchList(c.historyBranches).length === 0) {
      issues.push({ field: 'historyBranches', message: 'Name at least one branch to document.' });
    }
  }
  if (c.auditSkills.trim() && !/^[A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*@[0-9a-f]{40}$/i.test(c.auditSkills.trim())) {
    issues.push({ field: 'auditSkills', message: 'Audit skills must be owner/repo@ a full 40-character commit SHA.' });
  }
  if (c.schedule && c.schedule.trim().split(/\s+/).length !== 5) {
    issues.push({ field: 'schedule', message: 'A cron expression has five fields, e.g. 0 9 * * *' });
  }
  return issues;
}
