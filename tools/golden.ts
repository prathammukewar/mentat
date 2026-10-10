// Prints the golden fixture used by the unit and browser tests.
// Run with `npm run golden > tests/golden.json` only when the generator is
// meant to change; any diff in that file is a breaking change for stored runs.

import { Rng } from '../core/prng.ts';
import { CLASSIC, problemAt, type GameSettings } from '../core/problems.ts';

const SEEDS = [0, 1, 42, 0x9e3779b9, 0xdeadbeef, 0xffffffff];

const CUSTOM: GameSettings = {
  ops: { add: false, sub: true, mul: false, div: true },
  addLeft: { min: 0, max: 9999 },
  addRight: { min: 10, max: 20 },
  mulLeft: { min: 0, max: 3 },
  mulRight: { min: 1, max: 1000 },
  duration: 60,
};

const out = {
  rng: SEEDS.map((seed) => {
    const r = new Rng(seed);
    return { seed, next: Array.from({ length: 8 }, () => r.next()) };
  }),
  classic: SEEDS.map((seed) => ({
    seed,
    problems: Array.from({ length: 40 }, (_, i) => {
      const p = problemAt(seed, CLASSIC, i);
      return [p.op, p.left, p.right, p.answer];
    }),
  })),
  custom: {
    settings: CUSTOM,
    seeds: SEEDS.map((seed) => ({
      seed,
      problems: Array.from({ length: 20 }, (_, i) => {
        const p = problemAt(seed, CUSTOM, i);
        return [p.op, p.left, p.right, p.answer];
      }),
    })),
  },
};

console.log(JSON.stringify(out));
