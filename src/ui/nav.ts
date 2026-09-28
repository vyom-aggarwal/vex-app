import { useEffect, useRef, useSyncExternalStore } from 'react';
import { firstGamepad } from '../shared/input/input';
import { play } from './sound';

/**
 * Menu navigation shared by mouse, keyboard and gamepad:
 * - tracks the last input device (for KeyHint glyphs and the pad focus ring)
 * - gamepad: D-pad / left stick move focus spatially inside the active nav scope, A selects,
 *   B goes back, LB/RB switch tabs, Start fires `start` listeners
 * - keyboard: Esc goes back, [ and ] switch tabs (Tab/Enter work natively)
 *
 * Scopes are elements marked `data-nav-scope="page|overlay|dialog|float"`; the highest-ranked visible
 * scope wins. With no scope (a live match) the gamepad belongs to the robot.
 */

export type Device = 'keyboard' | 'mouse' | 'xbox' | 'playstation';
export type PadFamily = 'xbox' | 'playstation';

let device: Device = 'mouse';
let family: PadFamily = 'xbox';
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export const padFamily = (id: string): PadFamily => (/054c|playstation|dualsense|dualshock|wireless controller/i.test(id) ? 'playstation' : 'xbox');

function setDevice(d: Device): void {
  if (d === 'xbox' || d === 'playstation') family = d;
  if (d === device) return;
  device = d;
  if (typeof document !== 'undefined') document.documentElement.dataset.input = d === 'xbox' || d === 'playstation' ? 'pad' : d;
  emit();
}

const subscribe = (cb: () => void) => {
  subs.add(cb);
  return () => void subs.delete(cb);
};

/** Last input device used (re-renders on change). */
export const useDevice = (): Device => useSyncExternalStore(subscribe, () => device, () => device);
/** Last gamepad family seen (Xbox until a PlayStation pad is used). */
export const usePadFamily = (): PadFamily => useSyncExternalStore(subscribe, () => family, () => family);

// ---------------------------------------------------------------------------------------------
// Back / tab / start handler stacks (most recently mounted wins)
// ---------------------------------------------------------------------------------------------

type BackFn = () => boolean | void;
const backStack: { current: BackFn }[] = [];
const tabStack: { current: (dir: 1 | -1) => void }[] = [];
const shortcuts: { current: { code?: string; pad?: number; fn: () => void } }[] = [];

function useStacked<T>(stack: { current: T }[], fn: T, active: boolean): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!active) return;
    const entry = ref as { current: T };
    stack.push(entry);
    return () => {
      const i = stack.lastIndexOf(entry);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [active, stack]);
}

/** Register a Back handler (Esc / B). Return false to pass Back to the next handler down. */
export const useBack = (fn: BackFn, active = true): void => useStacked(backStack, fn, active);
/** Register an LB/RB ( [ / ] ) tab switcher. */
export const useTabSwitch = (fn: (dir: 1 | -1) => void, active = true): void => useStacked(tabStack, fn, active);
/**
 * Register a screen shortcut: a key (KeyboardEvent.code, no modifiers, not while typing) and/or a
 * gamepad button (X = 2, Y = 3, Start = 9; A, B and the bumpers are reserved for navigation).
 * Only fires while a menu scope is active; the most recently registered wins per key.
 */
export const useShortcut = (keys: { code?: string; pad?: number }, fn: () => void, active = true): void =>
  useStacked(shortcuts, { ...keys, fn }, active);

function runShortcut(match: (s: { code?: string; pad?: number }) => boolean): boolean {
  for (let i = shortcuts.length - 1; i >= 0; i--) {
    const s = shortcuts[i].current;
    if (match(s)) {
      s.fn();
      return true;
    }
  }
  return false;
}

export function goBack(): boolean {
  for (let i = backStack.length - 1; i >= 0; i--) if (backStack[i].current() !== false) return true;
  return false;
}

function switchTab(dir: 1 | -1): void {
  const top = tabStack[tabStack.length - 1];
  if (top) {
    top.current(dir);
    uiSound('focus');
  }
}

// ---------------------------------------------------------------------------------------------
// UI sounds
// ---------------------------------------------------------------------------------------------

let soundsOn = true;
export function setUiSounds(on: boolean): void {
  soundsOn = on;
}
export function uiSound(kind: 'focus' | 'select'): void {
  if (soundsOn) play(kind);
}

// ---------------------------------------------------------------------------------------------
// Spatial focus
// ---------------------------------------------------------------------------------------------

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"]), [data-nav-item]';
const RANK: Record<string, number> = { page: 1, overlay: 2, dialog: 3, float: 4 };

const visible = (el: HTMLElement): boolean => {
  if (el.closest('[inert],[aria-hidden="true"]')) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

export function activeScope(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  let best: HTMLElement | null = null;
  for (const s of document.querySelectorAll<HTMLElement>('[data-nav-scope]')) {
    if (!visible(s)) continue;
    if (!best || (RANK[s.dataset.navScope ?? ''] ?? 0) >= (RANK[best.dataset.navScope ?? ''] ?? 0)) best = s;
  }
  return best;
}

export function focusables(scope: HTMLElement): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.closest('[data-nav-scope]') === scope && visible(el));
}

type Dir = 'up' | 'down' | 'left' | 'right';

function moveFocus(dir: Dir): void {
  const scope = activeScope();
  if (!scope) return;
  const list = focusables(scope);
  if (!list.length) return;
  const cur = document.activeElement as HTMLElement | null;
  if (!cur || !scope.contains(cur) || cur === document.body) {
    const first = scope.querySelector<HTMLElement>('[data-autofocus]') ?? list[0];
    first.focus({ preventScroll: false });
    first.scrollIntoView({ block: 'nearest' });
    uiSound('focus');
    return;
  }
  // Components with their own arrow handling (segmented controls, tabs, sliders, lists) get first say.
  const key = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }[dir];
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  if (!cur.dispatchEvent(ev)) {
    uiSound('focus');
    return;
  }
  const a = cur.getBoundingClientRect();
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of list) {
    if (el === cur || el.contains(cur) || cur.contains(el)) continue;
    const b = el.getBoundingClientRect();
    const bx = b.left + b.width / 2;
    const by = b.top + b.height / 2;
    // Distance along the travel axis must be positive (edge to edge, with a little overlap slack).
    let main: number;
    let cross: number;
    if (dir === 'down') {
      main = b.top - a.bottom + a.height * 0.5;
      cross = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right)) + Math.abs(bx - ax) * 0.1;
    } else if (dir === 'up') {
      main = a.top - b.bottom + a.height * 0.5;
      cross = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right)) + Math.abs(bx - ax) * 0.1;
    } else if (dir === 'right') {
      main = b.left - a.right + a.width * 0.5;
      cross = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom)) + Math.abs(by - ay) * 0.1;
    } else {
      main = a.left - b.right + a.width * 0.5;
      cross = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom)) + Math.abs(by - ay) * 0.1;
    }
    if (main <= 0) continue;
    const score = main + cross * 3;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  if (best) {
    best.focus({ preventScroll: true });
    best.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    uiSound('focus');
  }
}

function activate(): void {
  const scope = activeScope();
  if (!scope) return;
  const el = document.activeElement as HTMLElement | null;
  if (!el || !scope.contains(el)) return moveFocus('down');
  if (el instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit'].includes(el.type)) return;
  if (el instanceof HTMLTextAreaElement) return;
  el.click();
}

// ---------------------------------------------------------------------------------------------
// Global listeners
// ---------------------------------------------------------------------------------------------

const isField = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

const isControl = (t: EventTarget | null): boolean => t instanceof HTMLElement && (t.tagName === 'BUTTON' || t.tagName === 'A' || !!t.getAttribute('role'));

let started = false;

/** Start the global listeners and the gamepad poll loop (idempotent). */
export function startNav(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  document.documentElement.dataset.input = 'mouse';

  window.addEventListener(
    'keydown',
    (e) => {
      if (e.isTrusted) setDevice('keyboard');
      if (!e.isTrusted || e.defaultPrevented) return;
      if (e.key === 'Escape') {
        if (!activeScope()) return;
        if (isField(e.target) && (e.target as HTMLElement).tagName !== 'INPUT') return;
        if (goBack()) e.preventDefault();
      } else if ((e.key === '[' || e.key === ']') && !isField(e.target) && activeScope()) {
        switchTab(e.key === ']' ? 1 : -1);
      } else if (!isField(e.target) && !(isControl(e.target) && (e.code === 'Space' || e.code === 'Enter')) && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat && activeScope()) {
        if (runShortcut((s) => s.code === e.code)) e.preventDefault();
      }
    },
    false,
  );
  window.addEventListener('pointerdown', () => setDevice('mouse'), true);
  window.addEventListener(
    'click',
    (e) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('button:not(:disabled), a[href], [role="option"], [role="tab"], label')) uiSound('select');
    },
    true,
  );

  const prev = new Map<number, boolean>();
  let held: { dir: Dir; next: number } | null = null;
  const loop = (now: number) => {
    const p = firstGamepad();
    if (p) {
      const pressed = (i: number) => !!p.buttons[i]?.pressed;
      const edge = (i: number) => pressed(i) && !prev.get(i);
      let any = false;
      for (let i = 0; i < p.buttons.length; i++) if (pressed(i)) any = true;
      const lx = p.axes[0] ?? 0;
      const ly = p.axes[1] ?? 0;
      if (any || Math.hypot(lx, ly) > 0.5) setDevice(padFamily(p.id));
      const scope = activeScope();
      if (scope) {
        if (edge(0)) activate();
        if (edge(1)) goBack();
        if (edge(4)) switchTab(-1);
        if (edge(5)) switchTab(1);
        for (const b of [2, 3, 9]) if (edge(b)) runShortcut((s) => s.pad === b);
        const dir: Dir | null =
          pressed(12) || ly < -0.5 ? 'up' : pressed(13) || ly > 0.5 ? 'down' : pressed(14) || lx < -0.5 ? 'left' : pressed(15) || lx > 0.5 ? 'right' : null;
        if (!dir) held = null;
        else if (!held || held.dir !== dir) {
          moveFocus(dir);
          held = { dir, next: now + 380 };
        } else if (now >= held.next) {
          moveFocus(dir);
          held.next = now + 110;
        }
      } else held = null;
      for (let i = 0; i < p.buttons.length; i++) prev.set(i, pressed(i));
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
