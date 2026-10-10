import { ProblemStream, problemText, type GameSettings, type Problem } from '../../core/problems.ts';
import type { DeviceClass, InputKind, Mode, Run } from '../../core/run.ts';
import { tick as playTick } from './sound.ts';

export interface GameElements {
  screen: HTMLElement;
  problem: HTMLElement;
  input: HTMLInputElement;
  entry: HTMLOutputElement;
  time: HTMLElement;
  score: HTMLElement;
  keypad: HTMLElement;
}

export interface GameOptions {
  seed: number;
  settings: GameSettings;
  mode: Mode;
  keypad: boolean;
  sound: boolean;
  device: DeviceClass;
  onEnd: (run: Run) => void;
  onQuit: () => void;
}

const MAX_ENTRY = 9;

function digits(n: number): number {
  return String(Math.max(0, Math.floor(n))).length;
}

/** Widest problem and answer these settings can produce, in characters. */
export function fieldWidths(s: GameSettings): { problem: number; answer: number } {
  let problem = 5;
  let answer = 2;
  if (s.ops.add || s.ops.sub) {
    const sum = s.addLeft.max + s.addRight.max;
    if (s.ops.add) problem = Math.max(problem, digits(s.addLeft.max) + digits(s.addRight.max) + 3);
    if (s.ops.sub) problem = Math.max(problem, digits(sum) + digits(s.addLeft.max) + 3);
    answer = Math.max(answer, s.ops.add ? digits(sum) : digits(s.addRight.max));
  }
  if (s.ops.mul || s.ops.div) {
    const prod = s.mulLeft.max * s.mulRight.max;
    if (s.ops.mul) problem = Math.max(problem, digits(s.mulLeft.max) + digits(s.mulRight.max) + 3);
    if (s.ops.div) problem = Math.max(problem, digits(prod) + digits(s.mulLeft.max) + 3);
    answer = Math.max(answer, s.ops.mul ? digits(prod) : digits(s.mulRight.max));
  }
  return { problem, answer };
}

/**
 * One timed solo run. The hot path (a keystroke that completes an answer)
 * does a string compare, a few array pushes and two textContent writes, all
 * synchronously inside the input handler, so the next problem is painted in
 * the very next frame.
 */
export class Game {
  private readonly el: GameElements;
  private readonly opts: GameOptions;
  private readonly stream: ProblemStream;
  private readonly durationMs: number;

  private running = false;
  private t0 = 0;
  private startedAt = 0;
  private index = 0;
  private current!: Problem;
  private answer = '';
  private entry = '';
  private shown = 0;
  private solvedAt: number[] = [];
  private firstKey: number[] = [-1];
  private wrong: number[] = [0];
  private keyInputs = 0;
  private touchInputs = 0;
  private clock = 0;

  constructor(el: GameElements, opts: GameOptions) {
    this.el = el;
    this.opts = opts;
    this.stream = new ProblemStream(opts.seed, opts.settings);
    this.durationMs = opts.settings.duration * 1000;
  }

  start(): void {
    const { el, opts } = this;
    const widths = fieldWidths(opts.settings);
    el.problem.style.width = `${widths.problem + 0.5}ch`;
    el.input.style.width = el.entry.style.width = `${widths.answer + 1.2}ch`;
    el.input.hidden = opts.keypad;
    el.entry.hidden = !opts.keypad;
    el.keypad.hidden = !opts.keypad;
    el.screen.classList.toggle('with-keypad', opts.keypad);
    el.input.value = '';
    el.input.disabled = false;
    el.entry.textContent = '';
    el.score.textContent = '0';
    el.time.textContent = String(opts.settings.duration);

    el.input.addEventListener('input', this.onInput);
    el.input.addEventListener('paste', this.block);
    el.input.addEventListener('drop', this.block);
    el.keypad.addEventListener('pointerdown', this.onPadDown);
    el.keypad.addEventListener('pointerup', this.onPadUp);
    el.keypad.addEventListener('pointercancel', this.onPadUp);
    el.keypad.addEventListener('contextmenu', this.block);
    el.screen.addEventListener('pointerdown', this.keepFocus);
    document.addEventListener('keydown', this.onKeyDown, true);

    this.running = true;
    this.t0 = performance.now();
    this.startedAt = Date.now();
    this.show(0);
    if (!opts.keypad) el.input.focus({ preventScroll: true });
    this.scheduleClock();
  }

  /** Abandon the run without saving it. */
  quit(): void {
    if (!this.running) return;
    this.stop();
    this.opts.onQuit();
  }

  /** Stop silently, for when the page is navigating somewhere else anyway. */
  abort(): void {
    if (this.running) this.stop();
  }

  private show(index: number): void {
    this.index = index;
    this.current = this.stream.at(index);
    this.answer = String(this.current.answer);
    this.entry = '';
    this.el.problem.textContent = problemText(this.current);
  }

  private accept(value: string, eventTime: number, touch: boolean): void {
    if (!this.running) return;
    const ms = eventTime - this.t0;
    if (ms >= this.durationMs) return;
    if (touch) this.touchInputs++;
    else this.keyInputs++;

    const i = this.index;
    if (value.length > this.entry.length) {
      if (this.firstKey[i] === -1) this.firstKey[i] = Math.max(0, Math.round(ms - this.shown));
      if (!this.answer.startsWith(value)) this.wrong[i]!++;
    }
    this.entry = value;

    if (value !== this.answer) {
      if (touch) this.el.entry.textContent = value;
      return;
    }

    const at = Math.max(this.shown, Math.round(ms));
    this.solvedAt.push(at);
    this.firstKey.push(-1);
    this.wrong.push(0);
    this.shown = at;
    this.show(i + 1);
    if (touch) this.el.entry.textContent = '';
    else this.el.input.value = '';
    this.el.score.textContent = String(this.solvedAt.length);
    if (this.opts.sound) playTick();
  }

  private onInput = (e: Event): void => {
    const field = this.el.input;
    let v = field.value;
    if (/[^0-9]/.test(v)) {
      v = v.replace(/[^0-9]/g, '');
      field.value = v;
    }
    if (v.length > MAX_ENTRY) {
      v = v.slice(0, MAX_ENTRY);
      field.value = v;
    }
    this.accept(v, e.timeStamp || performance.now(), false);
  };

  private onPadDown = (e: PointerEvent): void => {
    const key = (e.target as Element).closest<HTMLElement>('[data-key]');
    if (!key) return;
    e.preventDefault();
    key.classList.add('down');
    this.press(key.dataset.key!, e.timeStamp || performance.now(), true);
  };

  private onPadUp = (e: PointerEvent): void => {
    (e.target as Element).closest('[data-key]')?.classList.remove('down');
  };

  private press(key: string, time: number, touch: boolean): void {
    let v = this.entry;
    if (key === 'back') v = v.slice(0, -1);
    else if (key === 'clear') v = '';
    else if (v.length < MAX_ENTRY) v += key;
    this.accept(v, time, touch);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.running) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      this.quit();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (this.opts.keypad) {
      // A hardware keyboard on a touch device still works.
      if (/^[0-9]$/.test(e.key)) this.press(e.key, e.timeStamp, false);
      else if (e.key === 'Backspace') this.press('back', e.timeStamp, false);
      else return;
      e.preventDefault();
      return;
    }
    // Typing while the field lost focus puts the focus back first, and the
    // keystroke lands in the field.
    if (document.activeElement !== this.el.input && /^[0-9]$|^Backspace$/.test(e.key)) {
      this.el.input.focus({ preventScroll: true });
    }
  };

  private keepFocus = (e: PointerEvent): void => {
    if (e.target !== this.el.input && !this.opts.keypad) e.preventDefault();
  };

  private block = (e: Event): void => {
    e.preventDefault();
  };

  private scheduleClock(): void {
    const remain = this.t0 + this.durationMs - performance.now();
    if (remain <= 0) {
      this.finish();
      return;
    }
    const secs = Math.ceil(remain / 1000);
    this.el.time.textContent = String(secs);
    this.clock = window.setTimeout(() => this.scheduleClock(), remain - (secs - 1) * 1000 + 2);
  }

  private stop(): void {
    this.running = false;
    clearTimeout(this.clock);
    const { el } = this;
    el.input.removeEventListener('input', this.onInput);
    el.input.removeEventListener('paste', this.block);
    el.input.removeEventListener('drop', this.block);
    el.keypad.removeEventListener('pointerdown', this.onPadDown);
    el.keypad.removeEventListener('pointerup', this.onPadUp);
    el.keypad.removeEventListener('pointercancel', this.onPadUp);
    el.keypad.removeEventListener('contextmenu', this.block);
    el.screen.removeEventListener('pointerdown', this.keepFocus);
    document.removeEventListener('keydown', this.onKeyDown, true);
    el.input.disabled = true;
    el.input.blur();
    for (const k of el.keypad.querySelectorAll('.down')) k.classList.remove('down');
  }

  private finish(): void {
    if (!this.running) return;
    this.stop();
    this.el.time.textContent = '0';
    const score = this.solvedAt.length;
    const run: Run = {
      v: 1,
      id: newId(),
      mode: this.opts.mode,
      seed: this.opts.seed,
      settings: this.opts.settings,
      startedAt: this.startedAt,
      score,
      solvedAt: this.solvedAt,
      firstKey: this.firstKey,
      wrong: this.wrong,
      input: inputKind(this.keyInputs, this.touchInputs, this.opts.keypad),
      device: this.opts.device,
    };
    this.opts.onEnd(run);
  }
}

function inputKind(keys: number, touches: number, keypad: boolean): InputKind {
  if (keys === 0 && touches === 0) return keypad ? 'touch' : 'keyboard';
  const minority = Math.min(keys, touches) / (keys + touches);
  if (minority >= 0.1) return 'mixed';
  return touches > keys ? 'touch' : 'keyboard';
}

function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}
