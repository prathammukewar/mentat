// Deterministic 32-bit PRNG shared by the browser, the server and the tests.
// Everything here uses Math.imul and >>> 0 so results are identical in every
// JavaScript engine. Never use Math.random for anything that affects play.

const TWO_32 = 0x1_0000_0000;

/** splitmix32: used to expand one 32-bit seed into a full xoshiro state. */
export function splitmix32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/** xoshiro128**, seeded through splitmix32. */
export class Rng {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  constructor(seed: number) {
    const sm = splitmix32(seed);
    this.s0 = sm();
    this.s1 = sm();
    this.s2 = sm();
    this.s3 = sm();
    // An all-zero state would stick at zero forever. splitmix32 can't produce
    // four zeros in a row, but guard anyway.
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s0 = 1;
  }

  /** Builds a generator from a raw state (used by the reference-vector test). */
  static fromState(s0: number, s1: number, s2: number, s3: number): Rng {
    const r = new Rng(0);
    r.s0 = s0 >>> 0;
    r.s1 = s1 >>> 0;
    r.s2 = s2 >>> 0;
    r.s3 = s3 >>> 0;
    return r;
  }

  /** Next unsigned 32-bit integer. */
  next(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (this.s1 << 9) >>> 0;
    this.s2 = (this.s2 ^ this.s0) >>> 0;
    this.s3 = (this.s3 ^ this.s1) >>> 0;
    this.s1 = (this.s1 ^ this.s2) >>> 0;
    this.s0 = (this.s0 ^ this.s3) >>> 0;
    this.s2 = (this.s2 ^ t) >>> 0;
    this.s3 = rotl(this.s3, 11);
    return result;
  }

  /** Uniform integer in [min, max], both inclusive, with no modulo bias. */
  int(min: number, max: number): number {
    const range = max - min + 1;
    if (!Number.isInteger(min) || !Number.isInteger(max) || range < 1 || range > TWO_32) {
      throw new RangeError(`bad range ${min}..${max}`);
    }
    const limit = TWO_32 - (TWO_32 % range);
    let x = this.next();
    while (x >= limit) x = this.next();
    return min + (x % range);
  }
}

/** Mixes two 32-bit values into one seed (used for per-problem streams). */
export function mix(a: number, b: number): number {
  let h = Math.imul((a ^ 0x5bd1e995) >>> 0, 0x9e3779b1) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  h = Math.imul(h ^ (b >>> 0), 0x85ebca6b) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** FNV-1a over UTF-16 code units, for turning labels like a date into a seed. */
export function seedFromString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** A fresh random seed for a new solo game. Not used inside the generator. */
export function randomSeed(): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0]!;
}

/** Seeds are shown to players as 8 lowercase hex digits. */
export function formatSeed(seed: number): string {
  return (seed >>> 0).toString(16).padStart(8, '0');
}

export function parseSeed(text: string): number | null {
  const t = text.trim().toLowerCase();
  if (!/^[0-9a-f]{1,8}$/.test(t)) return null;
  return parseInt(t, 16) >>> 0;
}
