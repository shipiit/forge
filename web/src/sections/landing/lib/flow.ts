/**
 * The review as a team: who does what, in which order. Steps light up the
 * nodes they name, so the diagram and the cards below it tell one story.
 */

export type FlowNodeId = 'pr' | 'scanners' | 'correctness' | 'security' | 'failure' | 'verifier' | 'posted';

export interface FlowNode {
  id: FlowNodeId;
  title: string;
  detail: string;
  badge?: string;
}

export const FLOW_NODES: Record<FlowNodeId, FlowNode> = {
  pr: { id: 'pr', title: 'Pull request', detail: 'diff + whole files' },
  scanners: { id: 'scanners', title: 'Scanners', detail: 'secrets · code · iac · deps', badge: 'free' },
  correctness: { id: 'correctness', title: 'Correctness', detail: 'logic, invariants, callers' },
  security: { id: 'security', title: 'Security', detail: 'untrusted input to sinks' },
  failure: { id: 'failure', title: 'Failure', detail: 'errors, nulls, races, leaks' },
  verifier: { id: 'verifier', title: 'Verifier', detail: 'every finding re-opened' },
  posted: { id: 'posted', title: 'Review posted', detail: 'inline · fixes · check run' },
};

export const SPECIALISTS: FlowNodeId[] = ['correctness', 'security', 'failure'];

export interface FlowStep {
  n: number;
  title: string;
  detail: string;
  lights: FlowNodeId[];
}

export const FLOW_STEPS: FlowStep[] = [
  {
    n: 1,
    title: 'Scanners go first',
    detail: 'Secrets, code, infrastructure and dependencies — deterministic, no model, no cost. Their results are handed to the reviewers.',
    lights: ['pr', 'scanners'],
  },
  {
    n: 2,
    title: 'Reviewers work in parallel',
    detail: 'One reviewer by default; at deep, three with separate focus. Each reads the code around the change, not just the hunk.',
    lights: SPECIALISTS,
  },
  {
    n: 3,
    title: 'Every finding is re-checked',
    detail: 'A fresh agent opens the line each candidate names: confirms it, lowers an overstated severity, merges duplicates, or drops it.',
    lights: ['verifier'],
  },
  {
    n: 4,
    title: 'Only what holds is posted',
    detail: 'Inline comments with one-click fixes, a summary that says what was dropped and why, and a check run you can require.',
    lights: ['posted'],
  },
];
