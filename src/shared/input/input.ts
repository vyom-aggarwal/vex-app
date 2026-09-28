import { ACTIONS, DEFAULT_BINDINGS, type Action, type Bindings } from './bindings';
import type { ButtonState, KeyState, PadState } from './mapping';

/** Edge-triggered actions handled by the UI/session rather than the robot. */
export type UiAction = Extract<
  Action,
  'start' | 'menu' | 'reset' | 'camera' | 'view2d' | 'breakdown' | 'load' | 'loaderPrev' | 'loaderNext' | 'kindPin' | 'kindOpp' | 'kindYellow' | 'kindCup' | 'kindPair' | 'spawn'
>;

const EDGE = new Set<Action>(ACTIONS.filter((a) => a.edge).map((a) => a.id));
const HELD_BUTTONS: (keyof ButtonState)[] = ['liftUp', 'liftDown', 'intakeIn', 'intakeOut', 'gripPin', 'gripCup', 'wrist', 'tool', 'align'];

const isFormField = (t: EventTarget | null): boolean =>
  typeof HTMLElement !== 'undefined' &&
  t instanceof HTMLElement &&
  (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable);

const isControl = (t: EventTarget | null): boolean =>
  typeof HTMLElement !== 'undefined' && t instanceof HTMLElement && (t.tagName === 'BUTTON' || t.tagName === 'A' || t.getAttribute('role') === 'button');

export interface PadOptions {
  /** Analog trigger press threshold (0..1). */
  triggerThreshold: number;
}

/** First connected gamepad, preferring the "standard" mapping. */
export function firstGamepad(): Gamepad | null {
  const pads = typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
  let fallback: Gamepad | null = null;
  for (const p of pads) {
    if (!p || !p.connected) continue;
    if (p.mapping === 'standard') return p;
    fallback ??= p;
  }
  return fallback;
}

/** Samples keyboard + the first connected gamepad through the player's bindings. */
export class InputManager {
  /** When true, game keys don't scroll the page or activate focused controls. */
  gameActive = false;
  padName: string | null = null;
  bindings: Bindings;
  pad: PadOptions;
  private down = new Set<string>();
  private actions: UiAction[] = [];
  private prevPad = new Map<number, boolean>();
  private readonly onDown = (e: KeyboardEvent): void => {
    // Menus handled it (e.g. Esc closed a dialog), or it activates a focused button.
    if (e.defaultPrevented) return;
    if (isFormField(e.target) && e.code !== 'Escape') return;
    if (isControl(e.target) && (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space')) return;
    this.down.add(e.code);
    if (!e.repeat) for (const a of this.keyActions(e.code)) this.actions.push(a);
    if (this.gameActive && !e.ctrlKey && !e.metaKey && !e.altKey) e.preventDefault();
  };
  private readonly onUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
  };
  private readonly onBlur = (): void => this.down.clear();

  constructor(bindings: Bindings = DEFAULT_BINDINGS, pad: PadOptions = { triggerThreshold: 0.35 }) {
    this.bindings = bindings;
    this.pad = pad;
    window.addEventListener('keydown', this.onDown);
    window.addEventListener('keyup', this.onUp);
    window.addEventListener('blur', this.onBlur);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onDown);
    window.removeEventListener('keyup', this.onUp);
    window.removeEventListener('blur', this.onBlur);
  }

  private keyActions(code: string): UiAction[] {
    const out: UiAction[] = [];
    for (const a of EDGE) if (this.bindings.keys[a].includes(code)) out.push(a as UiAction);
    return out;
  }

  private pressed(p: Gamepad, i: number): boolean {
    const b = p.buttons[i];
    return !!b && (b.pressed || b.value > this.pad.triggerThreshold);
  }

  /** Call once per frame: polls gamepad button edges into the action queue. */
  poll(): void {
    const p = firstGamepad();
    this.padName = p ? p.id : null;
    if (!p) {
      this.prevPad.clear();
      return;
    }
    for (let i = 0; i < p.buttons.length; i++) {
      const now = this.pressed(p, i);
      if (now && !this.prevPad.get(i)) for (const a of EDGE) if (this.bindings.pad[a].includes(i)) this.actions.push(a as UiAction);
      this.prevPad.set(i, now);
    }
  }

  takeActions(): UiAction[] {
    const a = this.actions;
    this.actions = [];
    return a;
  }

  readPad(): PadState | null {
    const p = firstGamepad();
    if (!p) return null;
    const ax = (i: number): number => p.axes[i] ?? 0;
    const held = (a: Action): boolean => this.bindings.pad[a].some((i) => this.pressed(p, i));
    const out = { lx: ax(0), ly: ax(1), rx: ax(2), ry: ax(3) } as PadState;
    for (const b of HELD_BUTTONS) out[b] = held(b);
    return out;
  }

  readKeys(): KeyState {
    const k = (a: Action): boolean => this.bindings.keys[a].some((c) => this.down.has(c));
    const axis = (pos: Action, neg: Action): number => (k(pos) ? 1 : 0) - (k(neg) ? 1 : 0);
    const out = {
      fwd: axis('forward', 'back'),
      strafe: axis('strafeRight', 'strafeLeft'),
      turn: axis('turnRight', 'turnLeft'),
    } as KeyState;
    for (const b of HELD_BUTTONS) out[b] = k(b);
    return out;
  }
}

/**
 * Wait for the next key or gamepad button (used by the rebinding UI). Escape cancels.
 * Returns a cancel function.
 */
export function captureNext(cb: (r: { kind: 'keys'; code: string } | { kind: 'pad'; button: number } | null) => void): () => void {
  let done = false;
  let raf = 0;
  const initial = new Set<number>();
  const p0 = firstGamepad();
  if (p0) p0.buttons.forEach((b, i) => b.pressed && initial.add(i));
  const finish = (r: Parameters<typeof cb>[0]) => {
    if (done) return;
    done = true;
    window.removeEventListener('keydown', onKey, true);
    cancelAnimationFrame(raf);
    cb(r);
  };
  const onKey = (e: KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    finish(e.code === 'Escape' ? null : { kind: 'keys', code: e.code });
  };
  const poll = () => {
    const p = firstGamepad();
    if (p) {
      for (let i = 0; i < p.buttons.length; i++) {
        const b = p.buttons[i];
        if (b.pressed && !initial.has(i)) return finish({ kind: 'pad', button: i });
        if (!b.pressed) initial.delete(i);
      }
    }
    raf = requestAnimationFrame(poll);
  };
  window.addEventListener('keydown', onKey, true);
  raf = requestAnimationFrame(poll);
  return () => finish(null);
}
