import type { Page } from '@playwright/test';

export function solve(text: string): string {
  const [a, op, b] = text.split(' ');
  const x = Number(a);
  const y = Number(b);
  const answer = { '+': x + y, '−': x - y, '×': x * y, '÷': x / y }[op!];
  if (answer === undefined || !Number.isInteger(answer)) throw new Error(`can't solve "${text}"`);
  return String(answer);
}

export const problem = (page: Page) => page.locator('#g-problem').innerText();

export const SHORT_CLASSIC = {
  ops: { add: true, sub: true, mul: true, div: true },
  addLeft: { min: 2, max: 100 },
  addRight: { min: 2, max: 100 },
  mulLeft: { min: 2, max: 12 },
  mulRight: { min: 2, max: 100 },
  duration: 10,
};

/** Saves custom settings before the app loads. */
export async function useCustom(page: Page, settings: object): Promise<void> {
  await page.addInitScript((s) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('mentat.custom', JSON.stringify(s));
      sessionStorage.setItem('seeded', '1');
    }
  }, settings);
}
