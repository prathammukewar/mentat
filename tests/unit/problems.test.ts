import { describe, expect, it } from 'vitest';
import {
  CLASSIC,
  CLASSIC_KEY,
  cloneSettings,
  problemAt,
  settingsKey,
  validateSettings,
  type GameSettings,
  type Op,
} from '../../core/problems.ts';
import golden from '../golden.json';

const row = (seed: number, s: GameSettings, i: number) => {
  const p = problemAt(seed, s, i);
  return [p.op, p.left, p.right, p.answer];
};

describe('golden sequences', () => {
  it('classic problems match the fixture', () => {
    for (const { seed, problems } of golden.classic) {
      problems.forEach((expected, i) => expect(row(seed, CLASSIC, i)).toEqual(expected));
    }
  });

  it('custom problems match the fixture', () => {
    const s = golden.custom.settings as GameSettings;
    for (const { seed, problems } of golden.custom.seeds) {
      problems.forEach((expected, i) => expect(row(seed, s, i)).toEqual(expected));
    }
  });

  it('a problem depends only on seed, settings and index', () => {
    expect(problemAt(99, CLASSIC, 500)).toEqual(problemAt(99, CLASSIC, 500));
    const a = Array.from({ length: 20 }, (_, i) => problemAt(5, CLASSIC, i));
    const b = Array.from({ length: 20 }, (_, i) => problemAt(5, CLASSIC, 19 - i)).reverse();
    expect(a).toEqual(b);
  });
});

describe('classic distribution', () => {
  const N = 200000;
  const problems = Array.from({ length: N }, (_, i) => problemAt(Math.floor(i / 100) * 7919, CLASSIC, i % 100));

  it('keeps every operand in the configured range', () => {
    for (const p of problems) {
      if (p.op === 'add' || p.op === 'sub') {
        expect(p.x >= 2 && p.x <= 100 && p.y >= 2 && p.y <= 100).toBe(true);
      } else {
        expect(p.x >= 2 && p.x <= 12 && p.y >= 2 && p.y <= 100).toBe(true);
      }
    }
  });

  it('gets every answer right, never negative, always whole', () => {
    for (const p of problems) {
      const expected = { add: p.left + p.right, sub: p.left - p.right, mul: p.left * p.right, div: p.left / p.right }[p.op];
      expect(p.answer).toBe(expected);
      expect(Number.isInteger(p.answer) && p.answer >= 0).toBe(true);
    }
  });

  it('picks the four operations evenly', () => {
    const counts: Record<Op, number> = { add: 0, sub: 0, mul: 0, div: 0 };
    for (const p of problems) counts[p.op]++;
    const e = N / 4;
    const chi2 = Object.values(counts).reduce((t, c) => t + ((c - e) * (c - e)) / e, 0);
    expect(chi2).toBeLessThan(16.27); // 3 dof, 0.1%
  });

  it('spreads the multiplier 2..12 evenly', () => {
    const counts = new Array(11).fill(0);
    const muls = problems.filter((p) => p.op === 'mul' || p.op === 'div');
    for (const p of muls) counts[p.x - 2]++;
    const e = muls.length / 11;
    const chi2 = counts.reduce((t, c) => t + ((c - e) * (c - e)) / e, 0);
    expect(chi2).toBeLessThan(29.6); // 10 dof, 0.1%
  });

  it('spreads addition operands 2..100 evenly', () => {
    const counts = new Array(99).fill(0);
    const adds = problems.filter((p) => p.op === 'add' || p.op === 'sub');
    for (const p of adds) counts[p.y - 2]++;
    const e = adds.length / 99;
    const chi2 = counts.reduce((t, c) => t + ((c - e) * (c - e)) / e, 0);
    expect(chi2).toBeLessThan(148.2); // 98 dof, 0.1%
  });
});

describe('custom settings', () => {
  it('never divides by zero when the left range includes 0', () => {
    const s = cloneSettings(CLASSIC);
    s.ops = { add: false, sub: false, mul: false, div: true };
    s.mulLeft = { min: 0, max: 1 };
    for (let i = 0; i < 2000; i++) {
      const p = problemAt(3, s, i);
      expect(p.right).not.toBe(0);
      expect(p.answer * p.right).toBe(p.left);
    }
  });

  it('only uses the enabled operations', () => {
    const s = cloneSettings(CLASSIC);
    s.ops = { add: false, sub: false, mul: true, div: false };
    for (let i = 0; i < 500; i++) expect(problemAt(11, s, i).op).toBe('mul');
  });

  it('validates ranges and operations', () => {
    expect(validateSettings(CLASSIC)).toBeNull();
    const none = cloneSettings(CLASSIC);
    none.ops = { add: false, sub: false, mul: false, div: false };
    expect(validateSettings(none)).toMatch(/at least one/);
    const flipped = cloneSettings(CLASSIC);
    flipped.addLeft = { min: 50, max: 10 };
    expect(validateSettings(flipped)).toMatch(/bigger/);
    const zeroDiv = cloneSettings(CLASSIC);
    zeroDiv.mulLeft = { min: 0, max: 0 };
    expect(validateSettings(zeroDiv)).toMatch(/Division/);
    const big = cloneSettings(CLASSIC);
    big.mulRight = { min: 2, max: 100000 };
    expect(validateSettings(big)).toMatch(/between/);
  });

  it('keys ignore ranges of disabled operations', () => {
    expect(settingsKey(CLASSIC)).toBe(CLASSIC_KEY);
    const a = cloneSettings(CLASSIC);
    a.ops = { add: false, sub: false, mul: true, div: true };
    const b = cloneSettings(a);
    b.addLeft = { min: 5, max: 6 };
    expect(settingsKey(a)).toBe(settingsKey(b));
    const c = cloneSettings(a);
    c.duration = 60;
    expect(settingsKey(a)).not.toBe(settingsKey(c));
  });
});
