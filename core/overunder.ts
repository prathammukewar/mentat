import { Rng, mix } from './prng.ts';
import type { DeviceClass, InputKind } from './run.ts';

// Over or under: a hard problem and a whole number within 4 of its answer
// (never equal to it). The player says whether the shown number is over or
// under the true answer.

export type OuOp = 'add' | 'sub' | 'mul' | 'div' | 'sqrt';
export const OU_OPS: readonly OuOp[] = ['add', 'sub', 'mul', 'div', 'sqrt'];

export const OU_COUNT = 20;
export const OU_LIMIT_MS = 5000;
export const OU_GAP = 4;
export const OU_KEY = `ou|n${OU_COUNT}|t${OU_LIMIT_MS}|g${OU_GAP}`;

/** Keeps over-or-under streams separate from classic streams on the same seed. */
const SALT = 0x6f75_7531;

export interface OuProblem {
  index: number;
  op: OuOp;
  a: number;
  /** Absent for square roots. */
  b?: number;
  /** The true answer; not a whole number for most ÷ and √ problems. */
  answer: number;
  /** The whole number the player judges. */
  shown: number;
  /** True when the shown number is bigger than the answer. */
  over: boolean;
}

const OU_SYMBOL = { add: '+', sub: '−', mul: '×', div: '÷' } as const;

export function ouText(p: Pick<OuProblem, 'op' | 'a' | 'b'>): string {
  return p.op === 'sqrt' ? `√${p.a}` : `${p.a} ${OU_SYMBOL[p.op]} ${p.b}`;
}

/** The true answer as people would write it: whole, or to two decimals. */
export function formatAnswer(x: number): string {
  return Number.isInteger(x) ? String(x) : x.toFixed(2);
}

function twoDigitNonRound(rng: Rng): number {
  // 11..99 without the multiples of 10, which make × and ÷ too easy.
  const n = rng.int(0, 80);
  return 11 + n + Math.floor(n / 9);
}

function isqrt(n: number): number {
  let r = Math.floor(Math.sqrt(n));
  while (r * r > n) r--;
  while ((r + 1) * (r + 1) <= n) r++;
  return r;
}

export function ouProblemAt(seed: number, index: number): OuProblem {
  const rng = new Rng(mix(seed ^ SALT, index));
  const op = OU_OPS[rng.int(0, OU_OPS.length - 1)]!;
  let a: number;
  let b: number | undefined;
  let answer: number;
  let exact: boolean;

  switch (op) {
    case 'add':
      a = rng.int(1000, 9999);
      b = rng.int(1000, 9999);
      answer = a + b;
      exact = true;
      break;
    case 'sub': {
      // Both 4-digit, bigger first, and at least 100 apart.
      let x = 0;
      let y = 0;
      while (Math.abs(x - y) < 100) {
        x = rng.int(1000, 9999);
        y = rng.int(1000, 9999);
      }
      a = Math.max(x, y);
      b = Math.min(x, y);
      answer = a - b;
      exact = true;
      break;
    }
    case 'mul':
      a = rng.int(1000, 9999);
      b = twoDigitNonRound(rng);
      answer = a * b;
      exact = true;
      break;
    case 'div':
      a = rng.int(1000, 9999);
      b = twoDigitNonRound(rng);
      answer = a / b;
      exact = a % b === 0;
      break;
    case 'sqrt': {
      a = rng.int(1000, 9999);
      const r = isqrt(a);
      exact = r * r === a;
      answer = exact ? r : Math.sqrt(a);
      break;
    }
  }

  // Every whole number within 4 of the answer, except the answer itself.
  // That's always 8 candidates, 4 under and 4 over, so a coin flip is 50%.
  const candidates: number[] = [];
  if (exact) {
    for (let d = -OU_GAP; d <= OU_GAP; d++) if (d !== 0) candidates.push(answer + d);
  } else {
    const f = Math.floor(answer);
    for (let n = f - OU_GAP + 1; n <= f + OU_GAP; n++) candidates.push(n);
  }
  const shown = candidates[rng.int(0, candidates.length - 1)]!;
  return b === undefined
    ? { index, op, a, answer, shown, over: shown > answer }
    : { index, op, a, b, answer, shown, over: shown > answer };
}

export type OuChoice = 'over' | 'under' | 'timeout';

export interface OuRun {
  v: 1;
  kind: 'ou';
  id: string;
  seed: number;
  startedAt: number;
  count: number;
  limitMs: number;
  /** Per problem: 1 said over, 0 said under, -1 ran out of time. */
  picks: number[];
  /** Per problem: ms from the problem appearing to the answer (limitMs on a timeout). */
  times: number[];
  score: number;
  input: InputKind;
  device: DeviceClass;
}

export function choiceCode(p: OuChoice): number {
  return p === 'over' ? 1 : p === 'under' ? 0 : -1;
}

export function isRight(problem: OuProblem, code: number): boolean {
  return code !== -1 && (code === 1) === problem.over;
}

export function ouScore(seed: number, picks: number[]): number {
  return picks.reduce((t, code, i) => t + (isRight(ouProblemAt(seed, i), code) ? 1 : 0), 0);
}

export interface OuItem {
  problem: OuProblem;
  code: number;
  ms: number;
  right: boolean;
}

export interface OuSummary {
  score: number;
  count: number;
  accuracy: number;
  avgMs: number;
  totalMs: number;
  timeouts: number;
  byOp: Record<OuOp, { count: number; right: number; avgMs: number | null }>;
  misses: OuItem[];
}

export function ouSummarize(run: OuRun): OuSummary {
  const items: OuItem[] = run.picks.map((code, i) => {
    const problem = ouProblemAt(run.seed, i);
    return { problem, code, ms: run.times[i]!, right: isRight(problem, code) };
  });
  const byOp = {} as OuSummary['byOp'];
  for (const op of OU_OPS) {
    const these = items.filter((it) => it.problem.op === op);
    byOp[op] = {
      count: these.length,
      right: these.filter((it) => it.right).length,
      avgMs: these.length ? these.reduce((t, it) => t + it.ms, 0) / these.length : null,
    };
  }
  const totalMs = items.reduce((t, it) => t + it.ms, 0);
  const score = items.filter((it) => it.right).length;
  return {
    score,
    count: items.length,
    accuracy: items.length ? score / items.length : 0,
    avgMs: items.length ? totalMs / items.length : 0,
    totalMs,
    timeouts: items.filter((it) => it.code === -1).length,
    byOp,
    misses: items.filter((it) => !it.right),
  };
}

/** Better run first: more right, then less total time. */
export function compareOu(a: Pick<OuRun, 'score' | 'times'>, b: Pick<OuRun, 'score' | 'times'>): number {
  const ta = a.times.reduce((t, x) => t + x, 0);
  const tb = b.times.reduce((t, x) => t + x, 0);
  return b.score - a.score || ta - tb;
}
