import type { Settings } from './settings';

/** Applies theme, palette, motion and UI scale to the document root, where tokens.css reads them. */

export function applyAppearance(s: Pick<Settings, 'theme' | 'palette' | 'motion' | 'uiScale'>): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const dark = s.theme === 'dark' || (s.theme === 'system' && !window.matchMedia?.('(prefers-color-scheme: light)').matches);
  root.dataset.theme = dark ? 'dark' : 'light';
  if (s.palette === 'colorblind') root.dataset.palette = 'cb';
  else delete root.dataset.palette;
  if (s.motion === 'system') delete root.dataset.motion;
  else root.dataset.motion = s.motion;
  // Tokens are rem-based, so the root font size scales type and spacing together.
  root.style.fontSize = s.uiScale === 1 ? '' : `${Math.round(s.uiScale * 100)}%`;
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', token('--bg-0'));
}

/** True when motion should be cut to simple fades (setting, or the OS preference under "System"). */
export function reducedMotion(): boolean {
  if (typeof document === 'undefined') return false;
  const m = document.documentElement.dataset.motion;
  if (m === 'reduce') return true;
  if (m === 'full') return false;
  return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Current value of a CSS custom property on the root. */
export function token(name: string): string {
  if (typeof document === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** A color token as a 0xRRGGBB number (for three.js). Handles #rgb, #rrggbb and rgb(). */
export function tokenHex(name: string, fallback: number): number {
  const v = token(name);
  if (/^#[0-9a-f]{6}$/i.test(v)) return parseInt(v.slice(1), 16);
  if (/^#[0-9a-f]{3}$/i.test(v)) return parseInt(v.slice(1).replace(/./g, (c) => c + c), 16);
  const m = v.match(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
  if (m) return (+m[1] << 16) | (+m[2] << 8) | +m[3];
  return fallback;
}

/** A duration token in milliseconds (e.g. --dur-fast → 120). */
export function tokenMs(name: string, fallback: number): number {
  const v = token(name);
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return fallback;
  return v.endsWith('ms') ? n : v.endsWith('s') ? n * 1000 : n;
}
