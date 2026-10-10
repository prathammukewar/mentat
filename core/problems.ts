import { Rng, mix } from './prng.ts';

export type Op = 'add' | 'sub' | 'mul' | 'div';
export const OPS: readonly Op[] = ['add', 'sub', 'mul', 'div'];

export interface Range {
  min: number;
  max: number;
}

export interface GameSettings {
  ops: Record<Op, boolean>;
  /** Addition operands; subtraction is addition in reverse. */
  addLeft: Range;
  addRight: Range;
  /** Multiplication operands; division is multiplication in reverse. */
  mulLeft: Range;
  mulRight: Range;
  /** Seconds. */
  duration: number;
}

export const DURATIONS = [30, 60, 120, 300] as const;

export const CLASSIC: GameSettings = Object.freeze({
  ops: Object.freeze({ add: true, sub: true, mul: true, div: true }),
  addLeft: Object.freeze({ min: 2, max: 100 }),
  addRight: Object.freeze({ min: 2, max: 100 }),
  mulLeft: Object.freeze({ min: 2, max: 12 }),
  mulRight: Object.freeze({ min: 2, max: 100 }),
  duration: 120,
}) as GameSettings;

export interface Problem {
  index: number;
  op: Op;
  /** Left and right operands as displayed. */
  left: number;
  right: number;
  answer: number;
  /**
   * The underlying fact. For add and sub it's x + y, for mul and div it's
   * x × y, where x comes from the left range and y from the right range.
   * Subtraction shows (x + y) − x and division shows (x · y) ÷ x, so the
   * answer to both is y.
   */
  x: number;
  y: number;
}

export const OP_SYMBOL: Record<Op, string> = { add: '+', sub: '−', mul: '×', div: '÷' };

export function problemText(p: Pick<Problem, 'op' | 'left' | 'right'>): string {
  return `${p.left} ${OP_SYMBOL[p.op]} ${p.right}`;
}

export function enabledOps(settings: GameSettings): Op[] {
  return OPS.filter((op) => settings.ops[op]);
}

/**
 * Problem `index` of the stream for `seed`. Each problem gets its own PRNG
 * stream derived from (seed, index), so any problem can be computed on its
 * own. The server validates answers this way without replaying the game.
 */
export function problemAt(seed: number, settings: GameSettings, index: number): Problem {
  const ops = enabledOps(settings);
  if (ops.length === 0) throw new Error('no operations enabled');
  const rng = new Rng(mix(seed, index));
  const op = ops[rng.int(0, ops.length - 1)]!;
  if (op === 'add' || op === 'sub') {
    const x = rng.int(settings.addLeft.min, settings.addLeft.max);
    const y = rng.int(settings.addRight.min, settings.addRight.max);
    return op === 'add'
      ? { index, op, left: x, right: y, answer: x + y, x, y }
      : { index, op, left: x + y, right: x, answer: y, x, y };
  }
  let x = rng.int(settings.mulLeft.min, settings.mulLeft.max);
  const y = rng.int(settings.mulRight.min, settings.mulRight.max);
  if (op === 'div') {
    // A zero divisor can only come from a custom range that includes 0.
    // validateSettings rejects ranges that are only zero, so this ends.
    while (x === 0) x = rng.int(settings.mulLeft.min, settings.mulLeft.max);
    return { index, op, left: x * y, right: x, answer: y, x, y };
  }
  return { index, op, left: x, right: y, answer: x * y, x, y };
}

/** A lazily filled list of problems for one game. */
export class ProblemStream {
  private cache: Problem[] = [];
  readonly seed: number;
  readonly settings: GameSettings;

  constructor(seed: number, settings: GameSettings) {
    this.seed = seed;
    this.settings = settings;
  }

  at(index: number): Problem {
    let p = this.cache[index];
    if (!p) {
      p = problemAt(this.seed, this.settings, index);
      this.cache[index] = p;
    }
    return p;
  }
}

export const RANGE_LIMIT = 9999;

/** Returns an error message, or null if the settings are playable. */
export function validateSettings(s: GameSettings): string | null {
  const ops = enabledOps(s);
  if (ops.length === 0) return 'Pick at least one operation.';
  const check = (r: Range, name: string): string | null => {
    if (!Number.isInteger(r.min) || !Number.isInteger(r.max)) return `${name} needs whole numbers.`;
    if (r.min < 0 || r.max > RANGE_LIMIT) return `${name} must stay between 0 and ${RANGE_LIMIT}.`;
    if (r.min > r.max) return `${name}: the first number can't be bigger than the second.`;
    return null;
  };
  if (s.ops.add || s.ops.sub) {
    const e = check(s.addLeft, 'Addition left range') ?? check(s.addRight, 'Addition right range');
    if (e) return e;
  }
  if (s.ops.mul || s.ops.div) {
    const e = check(s.mulLeft, 'Multiplication left range') ?? check(s.mulRight, 'Multiplication right range');
    if (e) return e;
    if (s.ops.div && s.mulLeft.max === 0) return 'Division needs a left range above 0.';
  }
  if (!Number.isInteger(s.duration) || s.duration < 10 || s.duration > 600) return 'Pick a duration.';
  return null;
}

/**
 * A stable key for grouping runs with the same rules (personal bests,
 * history graphs). Ranges for disabled operations don't matter.
 */
export function settingsKey(s: GameSettings): string {
  const parts: string[] = [];
  const r = (x: Range) => `${x.min}-${x.max}`;
  if (s.ops.add || s.ops.sub) parts.push(`a${r(s.addLeft)},${r(s.addRight)}`);
  if (s.ops.mul || s.ops.div) parts.push(`m${r(s.mulLeft)},${r(s.mulRight)}`);
  parts.push(OPS.filter((o) => s.ops[o]).map((o) => o[0]).join(''));
  parts.push(`t${s.duration}`);
  return parts.join('|');
}

export const CLASSIC_KEY = settingsKey(CLASSIC);

export function isClassic(s: GameSettings): boolean {
  return settingsKey(s) === CLASSIC_KEY;
}

export function cloneSettings(s: GameSettings): GameSettings {
  return {
    ops: { ...s.ops },
    addLeft: { ...s.addLeft },
    addRight: { ...s.addRight },
    mulLeft: { ...s.mulLeft },
    mulRight: { ...s.mulRight },
    duration: s.duration,
  };
}
