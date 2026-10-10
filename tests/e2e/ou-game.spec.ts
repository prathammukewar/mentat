import { expect, test } from '@playwright/test';
import { ouState } from './helpers.ts';

test('over or under: keys, feedback, a timeout, results and history', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('link', { name: /Over or under/ }).click();
  await expect(page).toHaveURL(/#\/ou$/);
  await expect(page.locator('#ou-progress')).toHaveText('20');

  let expected = 0;
  for (let i = 0; i < 20; i++) {
    await expect(page.locator('#ou-progress')).toHaveText(String(20 - i));
    const s = await ouState(page);
    expect(Math.abs(s.shown - (s.over ? s.shown - 1 : s.shown + 1))).toBe(1);
    if (i === 4) {
      // Let this one run out of time.
      await expect(page.locator('#ou-last')).toContainText('Time', { timeout: 7000 });
      continue;
    }
    const answerOver = i === 9 ? !s.over : s.over;
    await page.keyboard.press(i % 2 ? (answerOver ? 'ArrowRight' : 'ArrowLeft') : answerOver ? 'ArrowUp' : 'ArrowDown');
    if (i !== 9) expected++;
    if (i < 19) {
      await expect(page.locator('#ou-score')).toHaveText(String(expected));
      await expect(page.locator('#ou-last')).toContainText(i === 9 ? 'Wrong' : 'Right');
    }
  }

  await expect(page).toHaveURL(/#\/results\//);
  await expect(page.locator('#our-score')).toHaveText(String(expected));
  await expect(page.locator('#our-timeouts')).toHaveText('1');
  await expect(page.locator('#our-best')).toHaveText('First over or under run.');
  await expect(page.locator('#our-misses li')).toHaveCount(2);
  await expect(page.locator('#our-misses')).toContainText('you ran out of time');
  await expect(page.locator('#our-again')).toBeFocused();

  // Same problems replays the seed.
  const seed = (await page.locator('#our-seed').innerText()).replace('Seed ', '');
  await page.locator('#our-same').click();
  await expect(page).toHaveURL(new RegExp(`#/ou\\?seed=${seed}`));
  await expect(page.locator('#ou-progress')).toHaveText('20');
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.locator('#ou-home-stats')).toHaveText(`Best ${expected} of 20 · 1 run`);

  await page.goto('./#/history');
  await page.locator('#h-group').selectOption({ label: 'Over or under, 20 problems (1)' });
  await expect(page.locator('#h-runs tr')).toHaveCount(1);
  await expect(page.locator('#h-runs tr td').nth(1)).toHaveText(`${expected} of 20`);
});

test('over or under: clicking the buttons answers once per click', async ({ page }) => {
  await page.goto('./#/ou');
  for (let i = 0; i < 3; i++) {
    const s = await ouState(page);
    await page.locator(s.over ? '#ou-over' : '#ou-under').click();
    await expect(page.locator('#ou-score')).toHaveText(String(i + 1));
    await expect(page.locator('#ou-progress')).toHaveText(String(19 - i));
  }
});
