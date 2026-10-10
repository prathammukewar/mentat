import { CLASSIC, CLASSIC_KEY, OPS, cloneSettings, isClassic, problemText, validateSettings, type GameSettings, type Op } from '../../core/problems.ts';
import { OU_COUNT, OU_KEY, OU_OPS, compareOu, formatAnswer, ouSummarize, ouText, type OuOp, type OuRun } from '../../core/overunder.ts';
import { formatSeed, parseSeed, randomSeed } from '../../core/prng.ts';
import type { Mode, Run } from '../../core/run.ts';
import { summarize } from '../../core/stats.ts';
import { renderChart } from './chart.ts';
import { deviceClass, useKeypad } from './device.ts';
import { Game, newId } from './game.ts';
import { OuGame } from './overunder.ts';
import { applyPrefs, loadCustom, loadPrefs, reducedMotion, savePrefs, saveCustom, type Prefs } from './prefs.ts';
import { primeSound } from './sound.ts';
import { allRuns, clearRuns, getRun, isOu, runKey, runsFor, saveRun, type AnyRun, type StoredRun } from './store.ts';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const screens = {
  home: $('screen-home'),
  game: $('screen-game'),
  results: $('screen-results'),
  ou: $('screen-ou'),
  ouResults: $('screen-ou-results'),
  history: $('screen-history'),
  settings: $('screen-settings'),
};
type ScreenName = keyof typeof screens;

let prefs: Prefs = loadPrefs();
applyPrefs(prefs);
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => applyPrefs(prefs));

let game: Game | OuGame | null = null;
/** The run that just finished, kept so results show without waiting on storage. */
let lastRun: AnyRun | null = null;
/** The best earlier run with the same rules, once it's been looked up. */
let lastBest: StoredRun | null | undefined = undefined;
let current: ScreenName = 'home';
let inputGuardUntil = 0;

function show(name: ScreenName): void {
  current = name;
  for (const [key, node] of Object.entries(screens)) node.hidden = key !== name;
  document.body.dataset.screen = name;
}

// ---------- formatting ----------

const OP_NAME: Record<Op, string> = { add: 'Addition', sub: 'Subtraction', mul: 'Multiplication', div: 'Division' };

function seconds(ms: number | null): string {
  return ms === null ? '–' : `${(ms / 1000).toFixed(2)} s`;
}

function durationLabel(s: number): string {
  return s % 60 === 0 ? `${s / 60} minute${s === 60 ? '' : 's'}` : `${s} seconds`;
}

function rulesLabel(s: GameSettings): string {
  if (isClassic(s)) return 'Classic, 2 minutes';
  if (isClassic({ ...s, duration: CLASSIC.duration })) return `Classic rules, ${durationLabel(s.duration)}`;
  const ops = OPS.filter((o) => s.ops[o]).map((o) => OP_NAME[o].toLowerCase());
  return `Custom: ${ops.join(', ')}, ${durationLabel(s.duration)}`;
}

const OU_NAME: Record<OuOp, string> = { ...OP_NAME, sqrt: 'Square root' };

function labelFor(run: AnyRun): string {
  return isOu(run) ? `Over or under, ${OU_COUNT} problems` : rulesLabel(run.settings);
}

/** Better run first. */
function compareRuns(a: AnyRun, b: AnyRun): number {
  if (isOu(a) && isOu(b)) return compareOu(a, b);
  return b.score - a.score;
}

function bestOf(runs: StoredRun[], excludeId?: string): StoredRun | null {
  const others = runs.filter((r) => r.id !== excludeId);
  return others.length ? [...others].sort(compareRuns)[0]! : null;
}

const whenFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// ---------- home ----------

async function renderHome(): Promise<void> {
  show('home');
  $('play-classic').focus({ preventScroll: true });
  const stats = $('home-stats');
  try {
    const runs = await runsFor(CLASSIC_KEY);
    if (runs.length === 0) {
      stats.textContent = '';
    } else {
      const best = Math.max(...runs.map((r) => r.score));
      const last = runs[runs.length - 1]!.score;
      stats.textContent = `Best ${best} · Last ${last} · ${runs.length} classic run${runs.length === 1 ? '' : 's'}`;
    }
  } catch {
    stats.textContent = '';
  }
  const ouStats = $('ou-home-stats');
  try {
    const runs = await runsFor(OU_KEY);
    const best = bestOf(runs);
    ouStats.textContent = best ? `Best ${best.score} of ${OU_COUNT} · ${runs.length} run${runs.length === 1 ? '' : 's'}` : '';
  } catch {
    ouStats.textContent = '';
  }
}

const customForm = $<HTMLFormElement>('custom-form');

function fillCustom(s: GameSettings): void {
  const f = customForm.elements as unknown as Record<string, HTMLInputElement>;
  for (const op of OPS) f[op]!.checked = s.ops[op];
  f.addLeftMin!.value = String(s.addLeft.min);
  f.addLeftMax!.value = String(s.addLeft.max);
  f.addRightMin!.value = String(s.addRight.min);
  f.addRightMax!.value = String(s.addRight.max);
  f.mulLeftMin!.value = String(s.mulLeft.min);
  f.mulLeftMax!.value = String(s.mulLeft.max);
  f.mulRightMin!.value = String(s.mulRight.min);
  f.mulRightMax!.value = String(s.mulRight.max);
  for (const r of customForm.querySelectorAll<HTMLInputElement>('input[name=duration]')) {
    r.checked = Number(r.value) === s.duration;
  }
}

function readCustom(): GameSettings {
  const f = customForm.elements as unknown as Record<string, HTMLInputElement>;
  const num = (name: string) => {
    const t = f[name]!.value.trim();
    return /^\d+$/.test(t) ? Number(t) : NaN;
  };
  const checked = customForm.querySelector<HTMLInputElement>('input[name=duration]:checked');
  return {
    ops: { add: f.add!.checked, sub: f.sub!.checked, mul: f.mul!.checked, div: f.div!.checked },
    addLeft: { min: num('addLeftMin'), max: num('addLeftMax') },
    addRight: { min: num('addRightMin'), max: num('addRightMax') },
    mulLeft: { min: num('mulLeftMin'), max: num('mulLeftMax') },
    mulRight: { min: num('mulRightMin'), max: num('mulRightMax') },
    duration: checked ? Number(checked.value) : 120,
  };
}

customForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const s = readCustom();
  const err = validateSettings(s);
  $('custom-error').textContent = err ?? '';
  if (err) return;
  saveCustom(s);
  primeIfSound();
  location.hash = '#/play/custom';
});

$('custom-reset').addEventListener('click', () => {
  fillCustom(CLASSIC);
  $('custom-error').textContent = '';
});

$('play-classic').addEventListener('click', () => {
  primeIfSound();
  location.hash = '#/play';
});

function primeIfSound(): void {
  if (prefs.sound) primeSound();
}

// ---------- game ----------

function startGame(mode: Mode, seed: number): void {
  game?.abort();
  const settings = mode === 'classic' ? cloneSettings(CLASSIC) : loadCustom();
  show('game');
  const keypad = useKeypad(prefs);
  game = new Game(
    {
      screen: screens.game,
      problem: $('g-problem'),
      input: $<HTMLInputElement>('g-input'),
      entry: $<HTMLOutputElement>('g-entry'),
      time: $('g-time'),
      score: $('g-score'),
      keypad: $('g-keypad'),
    },
    {
      seed,
      settings,
      mode,
      keypad,
      sound: prefs.sound,
      device: deviceClass(),
      onEnd: (run) => {
        game = null;
        void finished(run);
      },
      onQuit: () => {
        game = null;
        location.hash = '#/';
      },
    },
  );
  game.start();
}

$('g-quit').addEventListener('click', () => game?.quit());

function startOu(seed: number): void {
  game?.abort();
  show('ou');
  game = new OuGame(
    {
      screen: screens.ou,
      progress: $('ou-progress'),
      score: $('ou-score'),
      problem: $('ou-problem'),
      shown: $('ou-shown'),
      bar: $('ou-bar'),
      last: $('ou-last'),
      over: $('ou-over'),
      under: $('ou-under'),
    },
    {
      seed,
      sound: prefs.sound,
      reducedMotion: reducedMotion(prefs),
      device: deviceClass(),
      newId,
      onEnd: (run) => {
        game = null;
        void finished(run);
      },
      onQuit: () => {
        game = null;
        location.hash = '#/';
      },
    },
  );
  game.start();
}

$('ou-quit').addEventListener('click', () => game?.quit());

async function finished(run: AnyRun): Promise<void> {
  lastRun = run;
  lastBest = undefined;
  // Swallow keys for a moment so a keystroke typed as time ran out
  // doesn't press a button on the results screen.
  inputGuardUntil = performance.now() + 700;
  history.replaceState(null, '', `#/results/${run.id}`);
  showResults(run, undefined);
  try {
    lastBest = bestOf(await runsFor(runKey(run)));
    await saveRun(run);
    if (lastRun === run && (current === 'results' || current === 'ouResults')) showResults(run, lastBest, false);
  } catch {
    $(isOu(run) ? 'our-best' : 'r-best').textContent = 'This run could not be saved to your history.';
  }
}

function showResults(run: AnyRun, previous: StoredRun | null | undefined, focus = true): void {
  if (isOu(run)) renderOuResults(run, previous, focus);
  else renderResults(run, previous === undefined ? undefined : (previous?.score ?? null), focus);
}

// ---------- results ----------

function renderBest(run: Run, previousBest: number | null | undefined): void {
  const node = $('r-best');
  if (previousBest === undefined) {
    node.textContent = '';
  } else if (previousBest === null) {
    node.textContent = run.score > 0 ? 'First run with these rules.' : '';
  } else if (run.score > previousBest) {
    node.textContent = `New personal best. Previous best was ${previousBest}.`;
  } else {
    node.textContent = `Personal best: ${previousBest}`;
  }
}

function renderResults(run: Run, previousBest: number | null | undefined, focus = true): void {
  show('results');
  const s = summarize(run);
  $('r-mode').textContent = rulesLabel(run.settings);
  $('r-score').textContent = String(s.score);
  renderBest(run, previousBest);
  $('r-pace').textContent = s.perMinute.toFixed(1);
  $('r-avg').textContent = s.score ? seconds((run.solvedAt[s.score - 1] ?? 0) / s.score) : '–';
  $('r-wrong').textContent = String(s.wrongTotal);

  const ops = $('r-ops');
  ops.replaceChildren();
  for (const op of OPS) {
    if (!run.settings.ops[op]) continue;
    const tr = document.createElement('tr');
    const o = s.byOp[op];
    for (const text of [OP_NAME[op], String(o.count), seconds(o.avgMs)]) {
      const td = document.createElement('td');
      td.textContent = text;
      tr.append(td);
    }
    ops.append(tr);
  }

  const slow = $('r-slow');
  slow.replaceChildren();
  for (const item of s.slowest) {
    const li = document.createElement('li');
    const q = document.createElement('span');
    q.className = 'q';
    q.textContent = `${problemText(item.problem)} = ${item.problem.answer}`;
    const t = document.createElement('span');
    t.className = 't';
    t.textContent = seconds(item.ms);
    li.append(q, t);
    if (item.wrong > 0) {
      const w = document.createElement('span');
      w.className = 'w';
      w.textContent = `${item.wrong} wrong`;
      li.append(w);
    }
    slow.append(li);
  }
  if (s.slowest.length === 0) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'Nothing solved this time.';
    slow.append(li);
  }
  const u = s.unfinished;
  $('r-unfinished').textContent =
    u.ms > 0 ? `When time ran out: ${problemText(u.problem)}, on screen for ${seconds(u.ms)}.` : '';
  $('r-seed').textContent = `Seed ${formatSeed(run.seed)}`;

  const again = $('r-again');
  again.onclick = () => {
    primeIfSound();
    location.hash = run.mode === 'classic' ? '#/play' : '#/play/custom';
  };
  $('r-same').onclick = () => {
    primeIfSound();
    if (run.mode === 'custom') saveCustom(run.settings);
    location.hash = `#/play${run.mode === 'custom' ? '/custom' : ''}?seed=${formatSeed(run.seed)}`;
  };
  if (focus) again.focus({ preventScroll: true });
}

// ---------- over or under results ----------

function renderOuResults(run: OuRun, previous: StoredRun | null | undefined, focus = true): void {
  show('ouResults');
  const s = ouSummarize(run);
  $('our-score').textContent = String(s.score);
  const best = $('our-best');
  if (previous === undefined) best.textContent = '';
  else if (previous === null) best.textContent = 'First over or under run.';
  else if (compareRuns(run, previous) < 0) best.textContent = `New personal best. Previous best was ${previous.score} of ${OU_COUNT}.`;
  else best.textContent = `Personal best: ${previous.score} of ${OU_COUNT}`;
  $('our-acc').textContent = `${Math.round(s.accuracy * 100)}%`;
  $('our-avg').textContent = seconds(s.avgMs);
  $('our-timeouts').textContent = String(s.timeouts);

  const ops = $('our-ops');
  ops.replaceChildren();
  for (const op of OU_OPS) {
    const o = s.byOp[op];
    if (o.count === 0) continue;
    const tr = document.createElement('tr');
    for (const text of [OU_NAME[op], `${o.right} of ${o.count}`, seconds(o.avgMs)]) {
      const td = document.createElement('td');
      td.textContent = text;
      tr.append(td);
    }
    ops.append(tr);
  }

  const misses = $('our-misses');
  misses.replaceChildren();
  for (const m of s.misses) {
    const li = document.createElement('li');
    const q = document.createElement('span');
    q.className = 'q';
    q.textContent = `${ouText(m.problem)} = ${formatAnswer(m.problem.answer)}`;
    const d = document.createElement('span');
    d.className = 'detail';
    const said = m.code === -1 ? 'you ran out of time' : `you said ${m.code === 1 ? 'over' : 'under'}`;
    d.textContent = `${m.problem.shown} is ${m.problem.over ? 'over' : 'under'}; ${said}`;
    li.append(q, d);
    misses.append(li);
  }
  if (s.misses.length === 0) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'None. Every one right.';
    misses.append(li);
  }
  $('our-seed').textContent = `Seed ${formatSeed(run.seed)}`;

  const again = $('our-again');
  again.onclick = () => {
    primeIfSound();
    location.hash = '#/ou';
  };
  $('our-same').onclick = () => {
    primeIfSound();
    location.hash = `#/ou?seed=${formatSeed(run.seed)}`;
  };
  if (focus) again.focus({ preventScroll: true });
}

// ---------- history ----------

const groupSelect = $<HTMLSelectElement>('h-group');
let historyRuns: StoredRun[] = [];

async function renderHistory(): Promise<void> {
  show('history');
  try {
    historyRuns = await allRuns();
  } catch {
    historyRuns = [];
  }
  const groups = new Map<string, { label: string; count: number }>();
  groups.set(CLASSIC_KEY, { label: 'Classic, 2 minutes', count: 0 });
  for (const r of historyRuns) {
    const g = groups.get(r.key) ?? { label: labelFor(r), count: 0 };
    g.count++;
    groups.set(r.key, g);
  }
  const keep = groupSelect.value;
  groupSelect.replaceChildren();
  for (const [key, g] of groups) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = `${g.label} (${g.count})`;
    groupSelect.append(opt);
  }
  groupSelect.value = groups.has(keep) ? keep : CLASSIC_KEY;
  renderGroup();
}

function renderGroup(): void {
  const runs = historyRuns.filter((r) => r.key === groupSelect.value);
  const empty = runs.length === 0;
  const ou = groupSelect.value === OU_KEY;
  const head = $('h-runs').closest('table')!.querySelectorAll('th');
  head[2]!.textContent = ou ? 'Average time' : 'Per minute';
  $('h-empty').hidden = !empty;
  $('h-clear').hidden = historyRuns.length === 0;

  const stats = $('h-stats');
  stats.replaceChildren();
  if (!empty) {
    const scores = runs.map((r) => r.score);
    const recent = scores.slice(-10);
    const tiles: [string, string][] = [
      ['Runs', String(runs.length)],
      ['Best', String(Math.max(...scores))],
      [`Last ${recent.length}`, (recent.reduce((a, b) => a + b, 0) / recent.length).toFixed(1)],
    ];
    for (const [label, value] of tiles) {
      const div = document.createElement('div');
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      div.append(dt, dd);
      stats.append(div);
    }
  }

  const chartHost = $('h-chart');
  if (empty) chartHost.replaceChildren();
  else renderChart(chartHost, runs.slice(-200));

  const body = $('h-runs');
  body.replaceChildren();
  for (const r of [...runs].reverse().slice(0, 100)) {
    const tr = document.createElement('tr');
    const when = document.createElement('td');
    const link = document.createElement('a');
    link.href = `#/results/${r.id}`;
    link.textContent = whenFmt.format(r.startedAt);
    when.append(link);
    const cells = isOu(r)
      ? [`${r.score} of ${r.count}`, seconds(r.times.reduce((t, x) => t + x, 0) / r.times.length), r.input]
      : [String(r.score), (r.score / (r.settings.duration / 60)).toFixed(1), r.input];
    tr.append(when);
    for (const c of cells) {
      const td = document.createElement('td');
      td.textContent = c;
      tr.append(td);
    }
    body.append(tr);
  }
  (body.closest('table') as HTMLElement).hidden = empty;
}

groupSelect.addEventListener('change', renderGroup);
let resizeTimer = 0;
window.addEventListener('resize', () => {
  if (current !== 'history') return;
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(renderGroup, 120);
});

$('h-clear').addEventListener('click', async () => {
  if (!confirm('Delete every saved run on this device? This cannot be undone.')) return;
  try {
    await clearRuns();
  } catch {
    // Leave the list as it is if storage refused.
  }
  void renderHistory();
});

// ---------- settings ----------

const settingsForm = $<HTMLFormElement>('settings-form');

function renderSettings(): void {
  show('settings');
  const set = (name: string, value: string) => {
    for (const r of settingsForm.querySelectorAll<HTMLInputElement>(`input[name=${name}]`)) r.checked = r.value === value;
  };
  set('theme', prefs.theme);
  set('sound', prefs.sound ? 'on' : 'off');
  set('motion', prefs.motion);
  set('keypad', prefs.keypad);
}

settingsForm.addEventListener('change', () => {
  const get = (name: string) => settingsForm.querySelector<HTMLInputElement>(`input[name=${name}]:checked`)?.value;
  prefs = {
    theme: (get('theme') as Prefs['theme']) ?? 'system',
    sound: get('sound') === 'on',
    motion: (get('motion') as Prefs['motion']) ?? 'system',
    keypad: (get('keypad') as Prefs['keypad']) ?? 'auto',
  };
  savePrefs(prefs);
  applyPrefs(prefs);
  if (prefs.sound) primeSound();
});

// ---------- routing ----------

async function route(): Promise<void> {
  const hash = location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = hash.split('?');
  const params = new URLSearchParams(query);

  if (game && path !== '/play' && path !== '/play/custom' && path !== '/ou') {
    game.abort();
    game = null;
  }

  if (path === '/play' || path === '/play/custom') {
    const seed = parseSeed(params.get('seed') ?? '') ?? randomSeed();
    startGame(path === '/play' ? 'classic' : 'custom', seed);
    return;
  }
  if (path === '/ou') {
    startOu(parseSeed(params.get('seed') ?? '') ?? randomSeed());
    return;
  }
  if (path.startsWith('/results/')) {
    const id = decodeURIComponent(path.slice('/results/'.length));
    if (lastRun && lastRun.id === id) {
      showResults(lastRun, lastBest);
      return;
    }
    try {
      const run = await getRun(id);
      if (run) {
        showResults(run, undefined);
        return;
      }
    } catch {
      // Fall through to the menu.
    }
    location.replace('#/');
    return;
  }
  if (path === '/history') return renderHistory();
  if (path === '/settings') return renderSettings();
  return renderHome();
}

window.addEventListener('hashchange', () => void route());

document.addEventListener(
  'keydown',
  (e) => {
    if (performance.now() < inputGuardUntil) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.key === 'Escape' && current !== 'game' && current !== 'ou' && current !== 'home') {
      e.preventDefault();
      location.hash = '#/';
    }
    const idle = !document.activeElement || document.activeElement === document.body;
    if (e.key === 'Enter' && current === 'home' && idle) {
      e.preventDefault();
      primeIfSound();
      location.hash = '#/play';
    }
    if (prefs.sound && (current === 'game' || current === 'ou')) primeSound();
  },
  true,
);

fillCustom(loadCustom());
void route();
