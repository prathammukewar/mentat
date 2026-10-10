import { describe, expect, it } from 'vitest';
import { Rng } from '../../core/prng.ts';
import { decodeTimeline, encodeTimeline, fromBase64Url, toBase64Url, type Timeline } from '../../core/run.ts';

function randomTimeline(rng: Rng, score: number): Timeline {
  const solvedAt: number[] = [];
  let t = 0;
  for (let i = 0; i < score; i++) {
    t += rng.int(150, 20000);
    solvedAt.push(t);
  }
  const firstKey = Array.from({ length: score + 1 }, () => (rng.int(0, 9) === 0 ? -1 : rng.int(0, 5000)));
  const wrong = Array.from({ length: score + 1 }, () => (rng.int(0, 3) === 0 ? rng.int(1, 300) : 0));
  return { score, solvedAt, firstKey, wrong };
}

describe('timeline codec', () => {
  it('round-trips random timelines', () => {
    const rng = new Rng(2024);
    for (let n = 0; n < 300; n++) {
      const t = randomTimeline(rng, rng.int(0, 150));
      expect(decodeTimeline(encodeTimeline(t))).toEqual(t);
    }
  });

  it('keeps a 60-answer classic run small', () => {
    const t = randomTimeline(new Rng(1), 60);
    expect(encodeTimeline(t).length).toBeLessThan(400);
  });

  it('round-trips through base64url', () => {
    const bytes = encodeTimeline(randomTimeline(new Rng(9), 40));
    const text = toBase64Url(bytes);
    expect(text).toMatch(/^[A-Za-z0-9_-]*$/);
    expect(fromBase64Url(text)).toEqual(bytes);
  });

  it('rejects mismatched lengths and corrupt input', () => {
    expect(() => encodeTimeline({ score: 2, solvedAt: [1], firstKey: [0, 0, 0], wrong: [0, 0, 0] })).toThrow();
    const bytes = encodeTimeline(randomTimeline(new Rng(3), 10));
    expect(() => decodeTimeline(bytes.slice(0, bytes.length - 1))).toThrow();
    expect(() => decodeTimeline(Uint8Array.from([...bytes, 0]))).toThrow();
  });
});
