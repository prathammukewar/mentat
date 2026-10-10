import { expect, test } from '@playwright/test';
import { ouState } from './helpers.ts';

test('over or under: tapping the buttons on a phone', async ({ page }) => {
  await page.goto('./#/ou');
  const over = page.locator('#ou-over');
  const box = await over.boundingBox();
  const viewport = page.viewportSize()!;
  // The buttons sit in the bottom half, where thumbs are.
  expect(box!.y).toBeGreaterThan(viewport.height / 2);
  for (let i = 0; i < 5; i++) {
    const s = await ouState(page);
    await page.locator(s.over ? '#ou-over' : '#ou-under').tap();
    await expect(page.locator('#ou-score')).toHaveText(String(i + 1));
  }
});
