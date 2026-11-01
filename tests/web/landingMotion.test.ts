import { describe, it, expect } from 'vitest';
import { CANDIDATES, FINAL_FRAME, LOOP_MS, SCANNERS, STAGES, frameAt } from '../../web/src/sections/landing/lib/preview-script.js';
import { HUB_TABS } from '../../web/src/sections/landing/lib/hub.js';
import { FLOW_NODES, FLOW_STEPS, SPECIALISTS } from '../../web/src/sections/landing/lib/flow.js';
import { COMPARISON, PRODUCTS } from '../../web/src/sections/landing/lib/comparison.js';
import { FINDER_FOCUS } from '../../src/github/verify.js';
import { CAPABILITIES } from '../../web/src/sections/landing/lib/capabilities.js';
import { READ_ONLY, SKILL_DEMOS, WRITE } from '../../web/src/sections/landing/lib/skills-demo.js';
import { BEATS, PACKAGES, findingsShown, packageState } from '../../web/src/sections/landing/lib/supply-chain.js';
import { BUILT_IN_SKILLS } from '../../src/agent/skills.js';
import { editToolset, reviewToolset } from '../../src/agent/tools/registry.js';

describe('the hero review timeline', () => {
  const at = (stage: string, p: number) => {
    let start = 0;
    for (const s of STAGES) {
      if (s.id === stage) return frameAt(start + s.ms * p);
      start += s.ms;
    }
    throw new Error(stage);
  };

  it('plays the stages in order and loops', () => {
    expect(STAGES.map((s) => s.id)).toEqual(['scan', 'find', 'verify', 'post', 'fixed']);
    expect(frameAt(0).stage).toBe('scan');
    expect(frameAt(LOOP_MS).stage).toBe('scan');
    expect(frameAt(-1).stage).toBe('fixed');
  });

  it('reveals scanners, then candidates, then verdicts, and never takes one back within a loop', () => {
    let last = frameAt(0);
    for (let t = 0; t < LOOP_MS; t += 100) {
      const f = frameAt(t);
      expect(f.scannersDone).toBeGreaterThanOrEqual(last.scannersDone);
      expect(f.candidatesShown).toBeGreaterThanOrEqual(last.candidatesShown);
      expect(f.verdictsShown).toBeGreaterThanOrEqual(last.verdictsShown);
      expect(f.verdictsShown).toBeLessThanOrEqual(f.candidatesShown);
      last = f;
    }
  });

  it('finishes each stage complete', () => {
    expect(at('scan', 0.99).scannersDone).toBe(SCANNERS.length);
    expect(at('find', 0.99).candidatesShown).toBe(CANDIDATES.length);
    expect(at('verify', 0.99).verdictsShown).toBe(CANDIDATES.length);
  });

  it('posts before the fix lands, and resolves only after it does', () => {
    expect(at('post', 0.5)).toMatchObject({ commentShown: true, checkShown: true, fixApplied: false, resolved: false });
    expect(at('fixed', 0.3)).toMatchObject({ fixApplied: true, resolved: false });
    expect(at('fixed', 0.8)).toMatchObject({ fixApplied: true, resolved: true });
  });

  it('holds on the finished, fixed review when motion is reduced', () => {
    expect(FINAL_FRAME).toMatchObject({ stage: 'fixed', commentShown: true, fixApplied: true, resolved: true });
  });

  it('confirms one candidate and drops one, so the story shows both outcomes', () => {
    expect(CANDIDATES.map((c) => c.verdict).sort()).toEqual(['confirmed', 'rejected']);
  });
});

describe('the hub diagram', () => {
  it.each(HUB_TABS.map((t) => [t.label, t]))('%s has five a side, each named once', (_l, tab) => {
    expect(tab.left).toHaveLength(5);
    expect(tab.right).toHaveLength(5);
    const titles = [...tab.left, ...tab.right].map((n) => n.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('has a unique id per tab', () => {
    expect(new Set(HUB_TABS.map((t) => t.id)).size).toBe(HUB_TABS.length);
  });
});

describe('the agent flow', () => {
  it('has one specialist per finder the engine runs at deep', () => {
    expect(SPECIALISTS).toHaveLength(FINDER_FOCUS.length);
  });

  it('lights every node at some step, and only nodes that exist', () => {
    const lit = new Set(FLOW_STEPS.flatMap((s) => s.lights));
    expect([...lit].sort()).toEqual(Object.keys(FLOW_NODES).sort());
  });
});

describe('the comparison', () => {
  it('names the three products', () => {
    expect(PRODUCTS.map((p) => p.key)).toEqual(['forge', 'claude', 'bugbot']);
  });

  it('never leaves a Forge cell undocumented — those are our own claims to make', () => {
    for (const row of COMPARISON) expect(row.forge.kind, row.feature).not.toBe('unknown');
  });

  it('has unique feature rows', () => {
    expect(new Set(COMPARISON.map((r) => r.feature)).size).toBe(COMPARISON.length);
  });
});


describe('the skills demo', () => {
  it('shows every built-in skill and no skill that does not exist', () => {
    expect(SKILL_DEMOS.map((s) => s.name).sort()).toEqual(BUILT_IN_SKILLS.map((s) => s.name).sort());
  });

  it('marks a skill read-only exactly when its allowlist has no write tool', () => {
    for (const demo of SKILL_DEMOS) {
      const real = BUILT_IN_SKILLS.find((s) => s.name === demo.name)!;
      const writes = !real.tools || real.tools.some((t) => WRITE.includes(t));
      expect(demo.access, demo.name).toBe(writes ? 'read & write' : 'read-only');
    }
  });

  it('names the real tools', () => {
    expect(READ_ONLY.sort()).toEqual(reviewToolset().map((t) => t.spec.name).sort());
    const edit = editToolset().map((t) => t.spec.name);
    for (const t of WRITE) expect(edit).toContain(t);
  });
});

describe('the capability player', () => {
  it('gives every capability a run that ends in a result', () => {
    expect(new Set(CAPABILITIES.map((c) => c.id)).size).toBe(CAPABILITIES.length);
    for (const c of CAPABILITIES) {
      expect(c.run[0]?.kind, c.id).toBe('trigger');
      expect(c.run.at(-1)?.kind, c.id).toBe('result');
    }
  });
});

describe('the supply-chain demo', () => {
  it('shows each package, checks it, then posts the findings', () => {
    expect(packageState(0, 0)).toBe('hidden');
    expect(packageState(1, 0)).toBe('checking');
    expect(packageState(2, 0)).toBe('done');
    expect(packageState(2, 1)).toBe('hidden');
    expect(findingsShown(PACKAGES.length * 2)).toBe(0);
    expect(findingsShown(BEATS)).toBe(2);
  });

  it('ends with every package checked', () => {
    PACKAGES.forEach((_, i) => expect(packageState(BEATS, i)).toBe('done'));
  });
});
