import {
  OU_COUNT,
  OU_LIMIT_MS,
  choiceCode,
  formatAnswer,
  isRight,
  ouProblemAt,
  ouText,
  type OuChoice,
  type OuProblem,
  type OuRun,
} from '../../core/overunder.ts';
import type { DeviceClass } from '../../core/run.ts';
import { tick as playTick } from './sound.ts';

export interface OuElements {
  screen: HTMLElement;
  progress: HTMLElement;
  score: HTMLElement;
  problem: HTMLElement;
  shown: HTMLElement;
  bar: HTMLElement;
  last: HTMLElement;
  over: HTMLElement;
  under: HTMLElement;
}

export interface OuOptions {
  seed: number;
  sound: boolean;
  reducedMotion: boolean;
  device: DeviceClass;
  newId: () => string;
  onEnd: (run: OuRun) => void;
  onQuit: () => void;
}

const OVER_KEYS = new Set(['ArrowUp', 'ArrowRight', 'o', 'O']);
const UNDER_KEYS = new Set(['ArrowDown', 'ArrowLeft', 'u', 'U']);

/**
 * One over-or-under run: OU_COUNT problems, each with OU_LIMIT_MS to answer.
 * Answering shows the next problem inside the same event handler.
 */
export class OuGame {
  private readonly el: OuElements;
  private readonly opts: OuOptions;
  private running = false;
  private index = 0;
  private current!: OuProblem;
  private shownAt = 0;
  private startedAt = 0;
  private picks: number[] = [];
  private times: number[] = [];
  private score = 0;
  private keyInputs = 0;
  private touchInputs = 0;
  private timer = 0;
  private countdown: Animation | null = null;

  constructor(el: OuElements, opts: OuOptions) {
    this.el = el;
    this.opts = opts;
  }

  start(): void {
    const { el } = this;
    el.score.textContent = '0';
    el.last.textContent = '';
    el.last.className = 'ou-last';
    el.over.addEventListener('pointerdown', this.onPointer);
    el.under.addEventListener('pointerdown', this.onPointer);
    el.over.addEventListener('click', this.onClick);
    el.under.addEventListener('click', this.onClick);
    document.addEventListener('keydown', this.onKeyDown, true);
    this.running = true;
    this.startedAt = Date.now();
    this.show(0, performance.now());
  }

  quit(): void {
    if (!this.running) return;
    this.stop();
    this.opts.onQuit();
  }

  abort(): void {
    if (this.running) this.stop();
  }

  private show(index: number, now: number): void {
    const { el } = this;
    this.index = index;
    this.current = ouProblemAt(this.opts.seed, index);
    el.problem.textContent = ouText(this.current);
    el.shown.textContent = String(this.current.shown);
    el.progress.textContent = String(OU_COUNT - index);
    // The countdown bar runs on the compositor. With reduced motion it
    // drops a fifth at a time instead of sliding.
    this.countdown?.cancel();
    this.countdown = el.bar.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], {
      duration: OU_LIMIT_MS,
      easing: this.opts.reducedMotion ? 'steps(5, end)' : 'linear',
      fill: 'forwards',
    });
    this.shownAt = now;
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.answer('timeout', this.shownAt + OU_LIMIT_MS), OU_LIMIT_MS);
  }

  private answer(choice: OuChoice, eventTime: number): void {
    if (!this.running) return;
    let ms = Math.round(eventTime - this.shownAt);
    let code = choiceCode(choice);
    if (ms >= OU_LIMIT_MS) {
      ms = OU_LIMIT_MS;
      code = -1;
    }
    const problem = this.current;
    const right = isRight(problem, code);
    this.picks.push(code);
    this.times.push(Math.max(0, ms));
    if (right) this.score++;
    this.el.score.textContent = String(this.score);
    this.showLast(problem, code, right);
    if (right && this.opts.sound) playTick();

    if (this.index + 1 >= OU_COUNT) {
      this.finish();
      return;
    }
    this.show(this.index + 1, performance.now());
  }

  private showLast(p: OuProblem, code: number, right: boolean): void {
    const truth = `${ouText(p)} = ${formatAnswer(p.answer)}, so ${p.shown} is ${p.over ? 'over' : 'under'}`;
    const verdict = right ? 'Right' : code === -1 ? 'Time' : 'Wrong';
    this.el.last.textContent = `${right ? '✓' : '✗'} ${verdict}: ${truth}`;
    this.el.last.className = `ou-last ${right ? 'right' : 'wrong'}`;
  }

  private choiceFrom(target: EventTarget | null): OuChoice | null {
    const node = target as Node | null;
    if (node && this.el.over.contains(node)) return 'over';
    if (node && this.el.under.contains(node)) return 'under';
    return null;
  }

  private onPointer = (e: PointerEvent): void => {
    const choice = this.choiceFrom(e.target);
    if (!choice) return;
    e.preventDefault();
    if (e.pointerType === 'touch' || e.pointerType === 'pen') this.touchInputs++;
    else this.keyInputs++;
    this.answer(choice, e.timeStamp || performance.now());
  };

  // Pointer events already answered; a click that follows one is ignored.
  // Keyboard activation of a focused button (Enter or Space) arrives as a
  // click with detail 0 and still counts.
  private onClick = (e: MouseEvent): void => {
    if (e.detail !== 0) return;
    const choice = this.choiceFrom(e.target);
    if (!choice) return;
    this.keyInputs++;
    this.answer(choice, e.timeStamp || performance.now());
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.running || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      this.quit();
      return;
    }
    const choice = OVER_KEYS.has(e.key) ? 'over' : UNDER_KEYS.has(e.key) ? 'under' : null;
    if (!choice || e.repeat) return;
    e.preventDefault();
    this.keyInputs++;
    this.answer(choice, e.timeStamp || performance.now());
  };

  private stop(): void {
    this.running = false;
    clearTimeout(this.timer);
    const { el } = this;
    el.over.removeEventListener('pointerdown', this.onPointer);
    el.under.removeEventListener('pointerdown', this.onPointer);
    el.over.removeEventListener('click', this.onClick);
    el.under.removeEventListener('click', this.onClick);
    document.removeEventListener('keydown', this.onKeyDown, true);
    this.countdown?.cancel();
    this.countdown = null;
  }

  private finish(): void {
    this.stop();
    const keys = this.keyInputs;
    const touches = this.touchInputs;
    const minority = keys + touches ? Math.min(keys, touches) / (keys + touches) : 0;
    const run: OuRun = {
      v: 1,
      kind: 'ou',
      id: this.opts.newId(),
      seed: this.opts.seed,
      startedAt: this.startedAt,
      count: OU_COUNT,
      limitMs: OU_LIMIT_MS,
      picks: this.picks,
      times: this.times,
      score: this.score,
      input: minority >= 0.1 ? 'mixed' : touches > keys ? 'touch' : 'keyboard',
      device: this.opts.device,
    };
    this.opts.onEnd(run);
  }
}
