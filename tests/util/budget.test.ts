import { describe, it, expect } from 'vitest';
import { NO_CAP, budgetState, parseCap, renderBudgetStop, wouldExceed } from '../../src/util/budget.js';
import { runAgent } from '../../src/agent/loop.js';
import { FakeLLMClient } from '../../src/providers/fake.js';
import type { ChatResult } from '../../src/providers/types.js';

describe('parsing a cap', () => {
  it('treats unset, empty, and junk as no cap', () => {
    // A malformed budget must not stop the agent working — it just fails to constrain it.
    expect(parseCap(undefined)).toBe(NO_CAP);
    expect(parseCap('')).toBe(NO_CAP);
    expect(parseCap('   ')).toBe(NO_CAP);
    expect(parseCap('lots')).toBe(NO_CAP);
  });

  it('rejects zero and negatives rather than reading them as "spend nothing"', () => {
    expect(parseCap('0')).toBe(NO_CAP);
    expect(parseCap('-5')).toBe(NO_CAP);
  });

  it('accepts a real amount', () => {
    expect(parseCap('2.50')).toBe(2.5);
  });
});

describe('budget state', () => {
  const usage = { inputTokens: 1_000_000, outputTokens: 0 }; // $3.00 on the fallback price

  it('reports what has been spent against the cap', () => {
    const s = budgetState(usage, 'claude-3-5-sonnet', 10);
    expect(s.spentUsd).toBeCloseTo(3, 5);
    expect(s.capUsd).toBe(10);
    expect(s.exceeded).toBe(false);
    expect(s.fraction).toBeCloseTo(0.3, 5);
  });

  it('flags an exceeded budget', () => {
    expect(budgetState(usage, 'claude-3-5-sonnet', 1).exceeded).toBe(true);
  });

  it('treats reaching the cap exactly as exceeded', () => {
    expect(budgetState(usage, 'claude-3-5-sonnet', 3).exceeded).toBe(true);
  });

  it('never reports progress against an absent cap', () => {
    const s = budgetState(usage, 'claude-3-5-sonnet', NO_CAP);
    expect(s.exceeded).toBe(false);
    expect(s.fraction).toBe(0);
  });
});

describe('projecting the next turn', () => {
  const under = { spentUsd: 0.8, capUsd: 1, exceeded: false, fraction: 0.8 };

  it('stops before an overspend, not after it', () => {
    expect(wouldExceed(under, 0.3)).toBe(true); // 0.8 + 0.3 > 1
  });

  it('allows a turn that fits', () => {
    expect(wouldExceed(under, 0.1)).toBe(false);
  });

  it('never projects against an absent cap', () => {
    expect(wouldExceed({ spentUsd: 999, capUsd: NO_CAP, exceeded: false, fraction: 0 }, 100)).toBe(false);
  });
});

describe('the notice', () => {
  it('states the spend, the cap, and how to raise it', () => {
    const text = renderBudgetStop({ spentUsd: 1.234, capUsd: 1, exceeded: true, fraction: 1.2 }, 'claude-opus-4-8');
    expect(text).toContain('$1.2340');
    expect(text).toContain('$1.00');
    expect(text).toContain('claude-opus-4-8');
    expect(text).toContain('spend_cap_per_run_usd');
    expect(text).toMatch(/incomplete/i);
  });
});

/** A turn that costs roughly $0.30 on the fallback price. */
const turn = (text: string, withTool: boolean): ChatResult => ({
  text,
  toolCalls: withTool ? [{ id: 't', name: 'read_file', args: { path: 'a.ts' } }] : [],
  usage: { inputTokens: 100_000, outputTokens: 0 },
  stopReason: withTool ? 'tool_use' : 'end',
});

describe('the loop enforces the cap', () => {
  it('runs to completion when there is no cap', async () => {
    const client = new FakeLLMClient([turn('working', true), turn('done', false)], { model: 'claude-3-5-sonnet' });
    const res = await runAgent({
      client,
      system: 's',
      initialContent: [{ type: 'text', text: 'go' }],
      tools: [],
      limits: { maxIterations: 5, maxOutputTokens: 1000 },
      cwd: '/tmp',
    });
    expect(res.stoppedBy).toBe('end');
    expect(res.budget).toBeUndefined();
  });

  it('stops as soon as the cap is reached', async () => {
    // Each turn is ~$0.30; a $0.35 cap allows one and stops before the second.
    const client = new FakeLLMClient(
      [turn('one', true), turn('two', true), turn('three', false)],
      { model: 'claude-3-5-sonnet' },
    );
    const res = await runAgent({
      client,
      system: 's',
      initialContent: [{ type: 'text', text: 'go' }],
      tools: [],
      limits: { maxIterations: 5, maxOutputTokens: 1000, maxSpendUsd: 0.35 },
      cwd: '/tmp',
    });
    expect(res.stoppedBy).toBe('budget');
    expect(res.iterations).toBe(1);
    expect(res.budget?.spentUsd).toBeCloseTo(0.3, 5);
  });

  it('keeps the text the model had already produced', async () => {
    const client = new FakeLLMClient([turn('partial answer', true)], { model: 'claude-3-5-sonnet' });
    const res = await runAgent({
      client,
      system: 's',
      initialContent: [{ type: 'text', text: 'go' }],
      tools: [],
      limits: { maxIterations: 5, maxOutputTokens: 1000, maxSpendUsd: 0.01 },
      cwd: '/tmp',
    });
    expect(res.finalText).toBe('partial answer');
  });

  it('emits a budget event so a caller can log it', async () => {
    const seen: string[] = [];
    const client = new FakeLLMClient([turn('x', true)], { model: 'claude-3-5-sonnet' });
    await runAgent({
      client,
      system: 's',
      initialContent: [{ type: 'text', text: 'go' }],
      tools: [],
      limits: { maxIterations: 5, maxOutputTokens: 1000, maxSpendUsd: 0.01 },
      cwd: '/tmp',
      onEvent: (e) => seen.push(e.type),
    });
    expect(seen).toContain('budget');
  });

  it('still reports the usage it spent', async () => {
    const client = new FakeLLMClient([turn('x', true)], { model: 'claude-3-5-sonnet' });
    const res = await runAgent({
      client,
      system: 's',
      initialContent: [{ type: 'text', text: 'go' }],
      tools: [],
      limits: { maxIterations: 5, maxOutputTokens: 1000, maxSpendUsd: 0.01 },
      cwd: '/tmp',
    });
    expect(res.usage.inputTokens).toBe(100_000);
  });
});
