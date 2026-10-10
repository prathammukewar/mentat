import { describe, expect, it } from 'vitest';
import { Rng, formatSeed, mix, parseSeed, seedFromString } from '../../core/prng.ts';
import golden from '../golden.json';

describe('xoshiro128**', () => {
  it('matches the reference outputs for state {1, 2, 3, 4}', () => {
    // Same vector the rand_xoshiro crate checks against the C reference.
    const r = Rng.fromState(1, 2, 3, 4);
    const got = Array.from({ length: 10 }, () => r.next());
    expect(got).toEqual([
      11520, 0, 5927040, 70819200, 2031721883, 1637235492, 1287239034, 3734860849, 3729100597, 4258142804,
    ]);
  });

  it('reproduces the golden raw outputs', () => {
    for (const { seed, next } of golden.rng) {
      const r = new Rng(seed);
      expect(Array.from({ length: next.length }, () => r.next())).toEqual(next);
    }
  });

  it('only returns unsigned 32-bit integers', () => {
    const r = new Rng(7);
    for (let i = 0; i < 10000; i++) {
      const x = r.next();
      expect(Number.isInteger(x) && x >= 0 && x <= 0xffffffff).toBe(true);
    }
  });

  it('int() stays in range and hits every value about equally', () => {
    const r = new Rng(123);
    const counts = new Array(11).fill(0);
    const n = 110000;
    for (let i = 0; i < n; i++) {
      const v = r.int(2, 12);
      expect(v >= 2 && v <= 12).toBe(true);
      counts[v - 2]++;
    }
    // Chi-square with 10 degrees of freedom; 29.6 is the 0.1% critical value.
    const e = n / 11;
    const chi2 = counts.reduce((t, c) => t + ((c - e) * (c - e)) / e, 0);
    expect(chi2).toBeLessThan(29.6);
  });

  it('int() rejects empty or non-integer ranges', () => {
    const r = new Rng(1);
    expect(() => r.int(5, 4)).toThrow();
    expect(() => r.int(1.5, 4)).toThrow();
  });
});

describe('seed helpers', () => {
  it('formats and parses seeds as 8 hex digits', () => {
    expect(formatSeed(42)).toBe('0000002a');
    expect(parseSeed('0000002a')).toBe(42);
    expect(parseSeed('FFFFFFFF')).toBe(0xffffffff);
    expect(parseSeed('xyz')).toBeNull();
    expect(parseSeed('123456789')).toBeNull();
  });

  it('mix and seedFromString are stable', () => {
    expect(mix(1, 2)).toBe(mix(1, 2));
    expect(mix(1, 2)).not.toBe(mix(2, 1));
    expect(seedFromString('2026-10-09')).toBe(seedFromString('2026-10-09'));
    expect(seedFromString('a')).not.toBe(seedFromString('b'));
  });
});
