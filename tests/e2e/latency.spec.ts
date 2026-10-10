import { expect, test } from '@playwright/test';
import { problem, solve } from './helpers.ts';

// Measures, for every keystroke that completes an answer:
// - whether the next problem is already in the DOM when the input event
//   finishes (so it paints in the next frame), and
// - the time from the keystroke's event timestamp to the start of the next
//   frame, with the CPU slowed down 6x to stand in for a cheap Android phone.
// It also watches for layout shifts and checks the answer box never moves.

for (const throttle of [1, 6]) {
  test(`keystroke to next problem, CPU slowed ${throttle}x`, async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __lat: { frame: number[]; work: number[]; sync: boolean[]; moved: number; shift: number } };
      w.__lat = { frame: [], work: [], sync: [], moved: 0, shift: 0 };
      // Only shifts after the first keystroke count: that's play.
      let playing = false;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          const shift = e as unknown as { value: number; sources?: { node?: Node }[] };
          if (playing) w.__lat.shift += shift.value;
          else console.log('load shift', shift.value, (shift.sources ?? []).map((x) => (x.node as Element)?.id || x.node?.nodeName).join(','));
        }
      }).observe({ type: 'layout-shift', buffered: true });
      window.addEventListener('keydown', () => (playing = true), true);
      let before = '';
      let start = 0;
      let rect: DOMRect | null = null;
      window.addEventListener('input', () => {
        start = performance.now();
        before = document.getElementById('g-problem')?.textContent ?? '';
        rect = document.getElementById('g-input')!.getBoundingClientRect();
      }, true);
      window.addEventListener('input', (e) => {
        const after = document.getElementById('g-problem')?.textContent ?? '';
        if (after === before) return;
        w.__lat.work.push(performance.now() - start);
        w.__lat.sync.push(true);
        const r = document.getElementById('g-input')!.getBoundingClientRect();
        if (rect && (r.x !== rect.x || r.y !== rect.y || r.width !== rect.width)) w.__lat.moved++;
        const t0 = e.timeStamp;
        requestAnimationFrame((t) => w.__lat.frame.push(t - t0));
      });
    });

    page.on('console', (m) => m.text().startsWith('load shift') && console.log(m.text()));
    await page.goto('./#/play');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });

    const N = 40;
    for (let i = 0; i < N; i++) {
      const q = await problem(page);
      for (const d of solve(q)) await page.keyboard.press(d);
      await expect(page.locator('#g-score')).toHaveText(String(i + 1));
    }
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const lat = await page.evaluate(() => (window as unknown as { __lat: { frame: number[]; work: number[]; sync: boolean[]; moved: number; shift: number } }).__lat);
    const sorted = [...lat.frame].sort((a, b) => a - b);
    const p = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
    const work = Math.max(...lat.work);
    const report = { throttle, n: sorted.length, median: p(0.5).toFixed(1), p95: p(0.95).toFixed(1), max: sorted[sorted.length - 1]!.toFixed(1), maxHandlerMs: work.toFixed(2), layoutShift: lat.shift, boxMoved: lat.moved };
    console.log(JSON.stringify(report));
    test.info().annotations.push({ type: 'latency', description: JSON.stringify(report) });

    expect(lat.sync.length).toBe(N);
    expect(lat.moved).toBe(0);
    expect(lat.shift).toBe(0);
    // Our own work per correct keystroke (the app's input handler).
    expect(work).toBeLessThan(throttle === 1 ? 2 : 8);
    // Keystroke to the start of the next frame. Waiting for the next vsync
    // alone can take up to one frame, so the budget is one frame plus slack
    // at full speed and 50 ms at 6x.
    expect(p(0.95)).toBeLessThan(throttle === 1 ? 20 : 50);
  });
}
