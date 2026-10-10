import { CLASSIC, cloneSettings, validateSettings, type GameSettings } from '../../core/problems.ts';

export interface Prefs {
  theme: 'system' | 'light' | 'dark';
  sound: boolean;
  motion: 'system' | 'reduce';
  keypad: 'auto' | 'always' | 'never';
}

const DEFAULTS: Prefs = { theme: 'system', sound: false, motion: 'system', keypad: 'auto' };
const PREFS_KEY = 'mentat.prefs';
const CUSTOM_KEY = 'mentat.custom';

// localStorage can be missing or throw (private windows, blocked storage).
// Everything here falls back to defaults.
function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not fatal: the setting just won't survive a reload.
  }
}

export function loadPrefs(): Prefs {
  const saved = read<Partial<Prefs>>(PREFS_KEY) ?? {};
  return { ...DEFAULTS, ...saved };
}

export function savePrefs(p: Prefs): void {
  write(PREFS_KEY, p);
}

export function applyPrefs(p: Prefs): void {
  const root = document.documentElement;
  if (p.theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = p.theme;
  root.dataset.motion = reducedMotion(p) ? 'reduce' : 'full';
}

export function reducedMotion(p: Prefs): boolean {
  return p.motion === 'reduce' || matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function loadCustom(): GameSettings {
  const saved = read<GameSettings>(CUSTOM_KEY);
  if (saved && validateSettings(saved) === null) return saved;
  return cloneSettings(CLASSIC);
}

export function saveCustom(s: GameSettings): void {
  write(CUSTOM_KEY, s);
}
