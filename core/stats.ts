import { OPS, problemAt, type Op, type Problem } from './problems.ts';
import { shownAt, type Run } from './run.ts';

export interface Solved {
  problem: Problem;
  /** Time on screen until answered. */
  ms: number;
  firstKey: number;
  wrong: number;
}

export interface OpStats {
  count: number;
  avgMs: number | null;
}

export interface Summary {
  score: number;
  perMinute: number;
  byOp: Record<Op, OpStats>;
  /** Up to five slowest answered problems, slowest first. */
  slowest: Solved[];
  wrongTotal: number;
  /** The problem on screen when time ran out. */
  unfinished: { problem: Problem; ms: number; wrong: number };
}

export function solvedList(run: Run): Solved[] {
  const list: Solved[] = [];
  for (let i = 0; i < run.score; i++) {
    list.push({
      problem: problemAt(run.seed, run.settings, i),
      ms: run.solvedAt[i]! - shownAt(run, i),
      firstKey: run.firstKey[i]!,
      wrong: run.wrong[i]!,
    });
  }
  return list;
}

export function summarize(run: Run): Summary {
  const solved = solvedList(run);
  const byOp = {} as Record<Op, OpStats>;
  for (const op of OPS) {
    const these = solved.filter((s) => s.problem.op === op);
    byOp[op] = {
      count: these.length,
      avgMs: these.length ? these.reduce((t, s) => t + s.ms, 0) / these.length : null,
    };
  }
  const slowest = [...solved].sort((a, b) => b.ms - a.ms || a.problem.index - b.problem.index).slice(0, 5);
  const durationMs = run.settings.duration * 1000;
  return {
    score: run.score,
    perMinute: run.score / (run.settings.duration / 60),
    byOp,
    slowest,
    wrongTotal: run.wrong.reduce((t, w) => t + w, 0),
    unfinished: {
      problem: problemAt(run.seed, run.settings, run.score),
      ms: Math.max(0, durationMs - shownAt(run, run.score)),
      wrong: run.wrong[run.score] ?? 0,
    },
  };
}
