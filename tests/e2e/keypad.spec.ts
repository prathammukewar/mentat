import { expect, test } from '@playwright/test';
import { problem, solve } from './helpers.ts';

test('the keypad answers problems and never focuses a text field', async ({ page }) => {
  await page.goto('./#/play');
  await expect(page.locator('#g-keypad')).toBeVisible();
  await expect(page.locator('#g-input')).toBeHidden();

  for (let i = 1; i <= 8; i++) {
    for (const d of solve(await problem(page))) await page.locator(`[data-key="${d}"]`).tap();
    await expect(page.locator('#g-score')).toHaveText(String(i));
  }
  const active = await page.evaluate(() => document.activeElement?.tagName);
  expect(active).toBe('BODY');

  // Backspace and clear.
  await page.locator('[data-key="1"]').tap();
  await page.locator('[data-key="2"]').tap();
  await page.locator('[data-key="back"]').tap();
  await expect(page.locator('#g-entry')).toHaveText('1');
  await page.locator('[data-key="clear"]').tap();
  await expect(page.locator('#g-entry')).toHaveText('');
});

test('fast overlapping taps are never dropped', async ({ page }) => {
  await page.goto('./#/play');
  // Fire pointer events the way a fast two-thumb typist does: the next key
  // goes down before the previous one comes up.
  const solved = await page.evaluate(async () => {
    const pad = document.getElementById('g-keypad')!;
    const key = (d: string) => pad.querySelector<HTMLElement>(`[data-key="${d}"]`)!;
    const fire = (el: HTMLElement, type: string, id: number) =>
      el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', isPrimary: id === 1 }));
    const solveText = (t: string) => {
      const [a, op, b] = t.split(' ');
      const x = Number(a), y = Number(b);
      return String({ '+': x + y, '−': x - y, '×': x * y, '÷': x / y }[op!]);
    };
    let id = 1;
    for (let n = 0; n < 30; n++) {
      const digits = solveText(document.getElementById('g-problem')!.textContent!);
      let prev: HTMLElement | null = null;
      for (const d of digits) {
        const el = key(d);
        fire(el, 'pointerdown', ++id);
        if (prev) fire(prev, 'pointerup', id - 1);
        prev = el;
      }
      if (prev) fire(prev, 'pointerup', id);
    }
    return Number(document.getElementById('g-score')!.textContent);
  });
  expect(solved).toBe(30);
  await expect(page.locator('.keypad .down')).toHaveCount(0);
});
