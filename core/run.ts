import type { GameSettings } from './problems.ts';

export type InputKind = 'keyboard' | 'touch' | 'mixed';
export type DeviceClass = 'phone' | 'tablet' | 'desktop';
export type Mode = 'classic' | 'custom';

/**
 * Everything we keep about one run. Problems aren't stored: they come back
 * from the seed and settings. All times are whole milliseconds.
 */
export interface Run {
  v: 1;
  id: string;
  mode: Mode;
  seed: number;
  settings: GameSettings;
  /** Wall-clock start, epoch ms. */
  startedAt: number;
  score: number;
  /** Time from the start when problem i was answered. Length = score. */
  solvedAt: number[];
  /**
   * Time from when problem i appeared to its first keystroke, or -1 if it
   * got none. Length = score + 1 (the last entry is the problem on screen
   * when time ran out).
   */
  firstKey: number[];
  /** Wrong keystrokes on problem i. Length = score + 1. */
  wrong: number[];
  input: InputKind;
  device: DeviceClass;
}

/** When problem i appeared, in ms from the start. */
export function shownAt(run: Pick<Run, 'solvedAt'>, i: number): number {
  return i === 0 ? 0 : run.solvedAt[i - 1]!;
}

// Compact timeline encoding: unsigned LEB128 varints.
// [version][score][solvedAt deltas x score][firstKey+1 x (score+1)][wrong x (score+1)]
// A classic run of 60 answers is about 300 bytes.

const CODEC_VERSION = 1;

function pushVarint(out: number[], value: number): void {
  if (!Number.isInteger(value) || value < 0) throw new RangeError(`varint ${value}`);
  let v = value;
  while (v >= 0x80) {
    out.push((v % 0x80) | 0x80);
    v = Math.floor(v / 0x80);
  }
  out.push(v);
}

export type Timeline = Pick<Run, 'score' | 'solvedAt' | 'firstKey' | 'wrong'>;

export function encodeTimeline(t: Timeline): Uint8Array {
  if (t.solvedAt.length !== t.score || t.firstKey.length !== t.score + 1 || t.wrong.length !== t.score + 1) {
    throw new Error('timeline lengths do not match the score');
  }
  const out: number[] = [];
  pushVarint(out, CODEC_VERSION);
  pushVarint(out, t.score);
  let prev = 0;
  for (const s of t.solvedAt) {
    pushVarint(out, s - prev);
    prev = s;
  }
  for (const k of t.firstKey) pushVarint(out, k + 1);
  for (const w of t.wrong) pushVarint(out, w);
  return Uint8Array.from(out);
}

export function decodeTimeline(bytes: Uint8Array): Timeline {
  let pos = 0;
  const read = (): number => {
    let result = 0;
    let mul = 1;
    for (;;) {
      if (pos >= bytes.length) throw new Error('timeline ended early');
      const b = bytes[pos++]!;
      result += (b & 0x7f) * mul;
      if (b < 0x80) return result;
      mul *= 0x80;
    }
  };
  const version = read();
  if (version !== CODEC_VERSION) throw new Error(`unknown timeline version ${version}`);
  const score = read();
  const solvedAt: number[] = [];
  let t = 0;
  for (let i = 0; i < score; i++) {
    t += read();
    solvedAt.push(t);
  }
  const firstKey: number[] = [];
  for (let i = 0; i <= score; i++) firstKey.push(read() - 1);
  const wrong: number[] = [];
  for (let i = 0; i <= score; i++) wrong.push(read());
  if (pos !== bytes.length) throw new Error('trailing bytes in timeline');
  return { score, solvedAt, firstKey, wrong };
}

export function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
