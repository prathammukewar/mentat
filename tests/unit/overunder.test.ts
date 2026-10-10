import { describe, expect, it } from 'vitest';
import {
  OU_LIMIT_MS,
  OU_OPS,
  compareOu,
  formatAnswer,
  isRight,
  ouProblemAt,
  ouScore,
  ouSummarize,
  ouText,
  type OuOp,
  type OuRun,
} from '../../core/overunder.ts';
import { problemAt, CLASSIC } from '../../core/problems.ts';
import golden from '../golden.json';

describe('over or under: golden', () => {
  it('matches the fixture', () => {
    for (const { seed, problems } of golden.overunder) {
      problems.forEach((want, i) => {
        const p = ouProblemAt(seed, i);
        expect([p.op, p.a, p.b ?? null, p.shown, p.over]).toEqual(want);
      });
    }
  });

  it('uses a different stream from classic on the same seed', () => {
    const ou = Array.from({ length: 10 }, (_, i) => ouProblemAt(7, i).a);
    const classic = Array.from({ length: 10 }, (_, i) => problemAt(7, CLASSIC, i).left);
    expect(ou).not.toEqual(classic);
  });
});

describe('over or under: generator', () => {
  const N = 100000;
  const problems = Array.from({ length: N }, (_, i) => ouProblemAt(Math.floor(i / 50) * 104729, i % 50));

  it('builds each operation from the right sizes', () => {
    for (const p of problems) {
      expect(p.a >= 1000 && p.a <= 9999).toBe(true);
      if (p.op === 'add' || p.op === 'sub') expect(p.b! >= 1000 && p.b! <= 9999).toBe(true);
      if (p.op === 'sub') expect(p.a - p.b!).toBeGreaterThanOrEqual(100);
      if (p.op === 'mul' || p.op === 'div') {
        expect(p.b! >= 11 && p.b! <= 99 && p.b! % 10 !== 0).toBe(true);
      }
      if (p.op === 'sqrt') expect(p.b).toBeUndefined();
    }
  });

  it('computes the true answer', () => {
    for (const p of problems) {
      const want = {
        add: p.a + (p.b ?? 0),
        sub: p.a - (p.b ?? 0),
        mul: p.a * (p.b ?? 1),
        div: p.a / (p.b ?? 1),
        sqrt: Math.sqrt(p.a),
      }[p.op];
      expect(p.answer).toBeCloseTo(want, 9);
    }
  });

  it('shows a whole number within 4 of the answer and never the answer', () => {
    for (const p of problems) {
      expect(Number.isInteger(p.shown)).toBe(true);
      expect(p.shown).not.toBe(p.answer);
      expect(Math.abs(p.shown - p.answer)).toBeLessThanOrEqual(4);
      expect(p.over).toBe(p.shown > p.answer);
    }
  });

  it('is over half the time and spreads the gap evenly', () => {
    const over = problems.filter((p) => p.over).length;
    expect(Math.abs(over / N - 0.5)).toBeLessThan(0.01);
    const exact = problems.filter((p) => Number.isInteger(p.answer));
    const gaps = new Map<number, number>();
    for (const p of exact) gaps.set(p.shown - p.answer, (gaps.get(p.shown - p.answer) ?? 0) + 1);
    expect([...gaps.keys()].sort((a, b) => a - b)).toEqual([-4, -3, -2, -1, 1, 2, 3, 4]);
    for (const n of gaps.values()) expect(Math.abs(n / exact.length - 1 / 8)).toBeLessThan(0.01);
  });

  it('picks the five operations evenly', () => {
    const counts = Object.fromEntries(OU_OPS.map((o) => [o, 0])) as Record<OuOp, number>;
    for (const p of problems) counts[p.op]++;
    const e = N / 5;
    const chi2 = Object.values(counts).reduce((t, c) => t + ((c - e) * (c - e)) / e, 0);
    expect(chi2).toBeLessThan(18.47); // 4 dof, 0.1%
  });

  it('formats problems and answers', () => {
    expect(ouText({ op: 'sqrt', a: 7342 })).toBe('√7342');
    expect(ouText({ op: 'mul', a: 4827, b: 38 })).toBe('4827 × 38');
    expect(formatAnswer(7342 / 13)).toBe('564.77');
    expect(formatAnswer(183426)).toBe('183426');
  });
});

describe('over or under: scoring', () => {
  const seed = 99;
  const truth = Array.from({ length: 20 }, (_, i) => ouProblemAt(seed, i));
  const picks = truth.map((p, i) => (i === 3 ? -1 : i % 7 === 0 ? (p.over ? 0 : 1) : p.over ? 1 : 0));
  const run: OuRun = {
    v: 1,
    kind: 'ou',
    id: 'x',
    seed,
    startedAt: 0,
    count: 20,
    limitMs: OU_LIMIT_MS,
    picks,
    times: picks.map((c) => (c === -1 ? OU_LIMIT_MS : 1500)),
    score: 0,
    input: 'keyboard',
    device: 'desktop',
  };

  it('counts a timeout as wrong', () => {
    expect(isRight(truth[3]!, -1)).toBe(false);
  });

  it('scores and summarizes a run', () => {
    // Wrong on 0, 7, 14 and the timeout on 3.
    expect(ouScore(seed, picks)).toBe(16);
    const s = ouSummarize({ ...run, score: 16 });
    expect(s.score).toBe(16);
    expect(s.timeouts).toBe(1);
    expect(s.misses.map((m) => m.problem.index)).toEqual([0, 3, 7, 14]);
    expect(s.accuracy).toBe(0.8);
    expect(s.totalMs).toBe(19 * 1500 + OU_LIMIT_MS);
    const total = Object.values(s.byOp).reduce((t, o) => t + o.count, 0);
    expect(total).toBe(20);
  });

  it('ranks more right first, then faster', () => {
    const a = { score: 18, times: [3000] };
    const b = { score: 17, times: [1000] };
    const c = { score: 18, times: [2000] };
    expect([a, b, c].sort(compareOu)).toEqual([c, a, b]);
  });
});
