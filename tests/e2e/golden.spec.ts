import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const golden = JSON.parse(readFileSync(resolve('tests/golden.json'), 'utf8'));
const core = resolve('core');

test('the generator gives the golden sequences in this browser', async ({ page }) => {
  await page.goto('http://localhost:5174/');
  const mismatches = await page.evaluate(
    async ({ golden, core }) => {
      const { Rng } = await import(`/@fs${core}/prng.ts`);
      const { CLASSIC, problemAt } = await import(`/@fs${core}/problems.ts`);
      const bad: string[] = [];
      for (const { seed, next } of golden.rng) {
        const r = new Rng(seed);
        next.forEach((v: number, i: number) => {
          const got = r.next();
          if (got !== v) bad.push(`rng ${seed}[${i}] ${got} != ${v}`);
        });
      }
      const check = (settings: unknown, seeds: { seed: number; problems: unknown[][] }[], label: string) => {
        for (const { seed, problems } of seeds) {
          problems.forEach((want, i) => {
            const p = problemAt(seed, settings, i);
            const got = [p.op, p.left, p.right, p.answer];
            if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(`${label} ${seed}[${i}] ${got} != ${want}`);
          });
        }
      };
      const { ouProblemAt } = await import(`/@fs${core}/overunder.ts`);
      for (const { seed, problems } of golden.overunder) {
        problems.forEach((want: unknown[], i: number) => {
          const p = ouProblemAt(seed, i);
          const got = [p.op, p.a, p.b ?? null, p.shown, p.over];
          if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(`ou ${seed}[${i}] ${got} != ${want}`);
        });
      }
      check(CLASSIC, golden.classic, 'classic');
      check(golden.custom.settings, golden.custom.seeds, 'custom');
      return bad;
    },
    { golden, core },
  );
  expect(mismatches).toEqual([]);
});
