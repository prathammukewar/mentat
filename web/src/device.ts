import type { DeviceClass } from '../../core/run.ts';
import type { Prefs } from './prefs.ts';

const coarse = () => matchMedia('(pointer: coarse)').matches;

export function deviceClass(): DeviceClass {
  if (!coarse()) return 'desktop';
  return Math.min(screen.width, screen.height) < 600 ? 'phone' : 'tablet';
}

/** Whether to show the on-screen keypad instead of a text field. */
export function useKeypad(prefs: Prefs): boolean {
  if (prefs.keypad === 'always') return true;
  if (prefs.keypad === 'never') return false;
  return coarse();
}
