import { expect, test } from '@playwright/test';
import { SHORT_CLASSIC, problem, solve, useCustom } from './helpers.ts';

test('Enter starts a classic game and answers advance on the last correct digit', async ({ page }) => {
  await page.goto('./');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/play$/);
  await expect(page.locator('#g-input')).toBeFocused();
  await expect(page.locator('#g-time')).toHaveText(/^1[12]\d$/);

  for (let i = 1; i <= 5; i++) {
    const q = await problem(page);
    await page.keyboard.type(solve(q));
    await expect(page.locator('#g-score')).toHaveText(String(i));
    await expect(page.locator('#g-input')).toHaveValue('');
  }

  // A wrong answer stays in the box until it's fixed.
  const q = await problem(page);
  const answer = solve(q);
  const wrongDigit = answer.endsWith('9') ? '8' : '9';
  await page.keyboard.type(answer.slice(0, -1) + wrongDigit);
  await expect(page.locator('#g-input')).toHaveValue(answer.slice(0, -1) + wrongDigit);
  expect(await problem(page)).toBe(q);
  await page.keyboard.press('Backspace');
  await page.keyboard.type(answer.slice(-1));
  await expect(page.locator('#g-score')).toHaveText('6');

  // Letters and paste are ignored.
  await page.keyboard.type('abc');
  await expect(page.locator('#g-input')).toHaveValue('');

  // Esc quits without saving.
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.locator('#home-stats')).toHaveText('');
});

test('typing after clicking away still lands in the answer box', async ({ page }) => {
  await page.goto('./#/play');
  await page.mouse.click(10, 300);
  const q = await problem(page);
  await page.keyboard.type(solve(q));
  await expect(page.locator('#g-score')).toHaveText('1');
});

test('a full timed run saves, shows results and personal bests', async ({ page }) => {
  await useCustom(page, SHORT_CLASSIC);
  await page.goto('./#/play/custom');
  let solved = 0;
  const deadline = Date.now() + 7000;
  while (Date.now() < deadline) {
    await page.keyboard.type(solve(await problem(page)));
    solved++;
    await page.waitForTimeout(150);
  }
  await expect(page).toHaveURL(/#\/results\//, { timeout: 8000 });
  await expect(page.locator('#r-score')).toHaveText(String(solved));
  await expect(page.locator('#r-mode')).toHaveText('Classic rules, 10 seconds');
  await expect(page.locator('#r-best')).toHaveText('First run with these rules.');
  await expect(page.locator('#r-slow li')).toHaveCount(Math.min(5, solved));
  await expect(page.locator('#r-again')).toBeFocused();

  // Reloading the results page reads the run back from IndexedDB.
  const url = page.url();
  await page.reload();
  await expect(page).toHaveURL(url);
  await expect(page.locator('#r-score')).toHaveText(String(solved));

  // Same problems replays the same seed.
  const seed = (await page.locator('#r-seed').innerText()).replace('Seed ', '');
  await page.locator('#r-same').click();
  await expect(page).toHaveURL(new RegExp(`seed=${seed}`));
  await expect(page.locator('#g-problem')).not.toHaveText('');
  const first = await problem(page);
  await page.keyboard.press('Escape');
  await page.goto(`./#/play/custom?seed=${seed}`);
  await expect(page.locator('#g-problem')).toHaveText(first);
  await page.keyboard.press('Escape');

  // History lists the run under its rules.
  await page.goto('./#/history');
  await page.locator('#h-group').selectOption({ label: 'Classic rules, 10 seconds (1)' });
  await expect(page.locator('#h-runs tr')).toHaveCount(1);
  await expect(page.locator('#h-chart svg')).toBeVisible();
});

test('keys pressed as time runs out do not trigger the results buttons', async ({ page }) => {
  await useCustom(page, SHORT_CLASSIC);
  await page.goto('./#/play/custom');
  await page.waitForURL(/#\/results\//, { timeout: 15000 });
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/results\//);
  await page.waitForTimeout(800);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/play\/custom$/);
});

test('menus work from the keyboard alone', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'Safari only tabs to links with a system setting turned on');
  await page.goto('./');
  await expect(page.locator('#play-classic')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('a[href="#/settings"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(page.locator('#screen-settings')).toBeVisible();
  await page.locator('input[name=theme][value=dark]').focus();
  await expect(page.locator('input[name=theme][value=dark]')).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#\/$/);
});

test('custom settings are validated', async ({ page }) => {
  await page.goto('./');
  await page.locator('#custom summary').click();
  for (const op of ['add', 'sub', 'mul', 'div']) await page.locator(`#custom-form input[name=${op}]`).uncheck();
  await page.getByRole('button', { name: 'Start custom game' }).click();
  await expect(page.locator('#custom-error')).toHaveText('Pick at least one operation.');
  await page.locator('#custom-form input[name=mul]').check();
  await page.locator('#custom-form input[name=mulLeftMin]').fill('20');
  await page.locator('#custom-form input[name=mulLeftMax]').fill('10');
  await page.getByRole('button', { name: 'Start custom game' }).click();
  await expect(page.locator('#custom-error')).toContainText("can't be bigger");
  await page.locator('#custom-form input[name=mulLeftMax]').fill('25');
  await page.locator('#custom-form input[value="30"]').check({ force: true });
  await page.getByRole('button', { name: 'Start custom game' }).click();
  await expect(page).toHaveURL(/#\/play\/custom$/);
  await expect(page.locator('#g-time')).toHaveText(/^(30|29)$/);
  expect(await problem(page)).toContain('×');
});
