import { describe, expect, it } from 'vitest';
import { CLASSIC, problemAt } from '../../core/problems.ts';
import type { Run } from '../../core/run.ts';
import { summarize } from '../../core/stats.ts';

const run: Run = {
  v: 1,
  id: 't',
  mode: 'classic',
  seed: 42,
  settings: CLASSIC,
  startedAt: 0,
  score: 6,
  solvedAt: [1000, 3000, 3500, 9500, 10000, 12000],
  firstKey: [300, 400, 100, 2000, 200, 500, -1],
  wrong: [0, 1, 0, 2, 0, 0, 3],
  input: 'keyboard',
  device: 'desktop',
};

describe('summarize', () => {
  const s = summarize(run);

  it('computes score and pace', () => {
    expect(s.score).toBe(6);
    expect(s.perMinute).toBe(3);
    expect(s.wrongTotal).toBe(6);
  });

  it('orders the slowest problems by time on screen', () => {
    expect(s.slowest.map((x) => x.ms)).toEqual([6000, 2000, 2000, 1000, 500]);
    expect(s.slowest[0]!.problem).toEqual(problemAt(42, CLASSIC, 3));
    expect(s.slowest[1]!.problem.index).toBe(1);
  });

  it('averages time per operation', () => {
    const total = Object.values(s.byOp).reduce((t, o) => t + o.count, 0);
    expect(total).toBe(6);
    for (const o of Object.values(s.byOp)) {
      if (o.count === 0) expect(o.avgMs).toBeNull();
      else expect(o.avgMs).toBeGreaterThan(0);
    }
  });

  it('reports the problem left on screen at the end', () => {
    expect(s.unfinished.problem.index).toBe(6);
    expect(s.unfinished.ms).toBe(120000 - 12000);
    expect(s.unfinished.wrong).toBe(3);
  });
});
