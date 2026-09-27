import { NO_BUTTONS, type ButtonState, type KeyState, type PadState } from './mapping';

/** Edge-triggered actions handled by the UI/session rather than the robot. */
export type UiAction =
  | 'start'
  | 'menu'
  | 'reset'
  | 'camera'
  | 'load'
  | 'loaderPrev'
  | 'loaderNext'
  | 'kindPin'
  | 'kindOpp'
  | 'kindYellow'
  | 'kindCup'
  | 'kindPair'
  | 'spawn'
  | 'view2d';

/** Controls table shown in Settings. Gamepad names follow the V5 controller. */
export const CONTROLS: { action: string; keys: string; pad: string }[] = [
  { action: 'Drive / turn', keys: 'W A S D, Q E / arrows', pad: 'Sticks (tank, arcade or split)' },
  { action: 'Lift up / down', keys: 'R / F', pad: 'L1 / L2' },
  { action: 'Intake in / out', keys: 'Space / Shift', pad: 'R1 / R2' },
  { action: 'Grip Pin', keys: 'J', pad: 'A' },
  { action: 'Grip Cup', keys: 'K', pad: 'B' },
  { action: 'Wrist flip', keys: 'L', pad: 'Y' },
  { action: 'Toggle / roller tool', keys: 'T', pad: 'X' },
  { action: 'Goal auto-align (hold)', keys: 'V', pad: 'Down' },
  { action: 'Load next Match Load', keys: 'G', pad: 'Up' },
  { action: 'Choose Loader', keys: '[ / ]', pad: 'Left / Right' },
  { action: 'Load type: alliance Pin / yellow Pin / Cup / nested pair / other-color Pin', keys: '1 / 2 / 3 / 4 / 5', pad: '—' },
  { action: 'Cycle camera', keys: 'C', pad: 'R3' },
  { action: 'Toggle 2D view', keys: 'M', pad: 'L3' },
  { action: 'Spawn object (Free Drive)', keys: 'P', pad: '—' },
  { action: 'Reset', keys: 'Backspace', pad: 'Back' },
  { action: 'Start / pause', keys: 'Enter / Esc', pad: 'Start' },
];

const KEY_ACTIONS: Record<string, UiAction> = {
  Enter: 'start',
  NumpadEnter: 'start',
  Escape: 'menu',
  Backspace: 'reset',
  KeyC: 'camera',
  KeyG: 'load',
  BracketLeft: 'loaderPrev',
  BracketRight: 'loaderNext',
  Digit1: 'kindPin',
  Digit2: 'kindYellow',
  Digit3: 'kindCup',
  Digit4: 'kindPair',
  Digit5: 'kindOpp',
  KeyP: 'spawn',
  KeyM: 'view2d',
};

const PAD_ACTIONS: [number, UiAction][] = [
  [9, 'start'],
  [8, 'reset'],
  [11, 'camera'],
  [10, 'view2d'],
  [12, 'load'],
  [14, 'loaderPrev'],
  [15, 'loaderNext'],
];

const isFormField = (t: EventTarget | null): boolean =>
  typeof HTMLElement !== 'undefined' &&
  t instanceof HTMLElement &&
  (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable);

/** Samples keyboard + the first connected gamepad. UI actions are edge-triggered and queued. */
export class InputManager {
  /** When true, game keys don't scroll or activate focused controls. */
  gameActive = false;
  padName: string | null = null;
  private down = new Set<string>();
  private actions: UiAction[] = [];
  private prevPad = new Map<number, boolean>();
  private readonly onDown = (e: KeyboardEvent): void => {
    if (isFormField(e.target) && e.code !== 'Escape') return;
    this.down.add(e.code);
    if (!e.repeat && KEY_ACTIONS[e.code]) this.actions.push(KEY_ACTIONS[e.code]);
    if (this.gameActive && !e.ctrlKey && !e.metaKey) e.preventDefault();
  };
  private readonly onUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
  };
  private readonly onBlur = (): void => this.down.clear();

  constructor() {
    window.addEventListener('keydown', this.onDown);
    window.addEventListener('keyup', this.onUp);
    window.addEventListener('blur', this.onBlur);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onDown);
    window.removeEventListener('keyup', this.onUp);
    window.removeEventListener('blur', this.onBlur);
  }

  private gamepad(): Gamepad | null {
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    let fallback: Gamepad | null = null;
    for (const p of pads) {
      if (!p || !p.connected) continue;
      if (p.mapping === 'standard') return p;
      fallback ??= p;
    }
    return fallback;
  }

  /** Call once per frame: polls gamepad button edges into the action queue. */
  poll(): void {
    const p = this.gamepad();
    this.padName = p ? p.id : null;
    for (const [i, action] of PAD_ACTIONS) {
      const now = !!p?.buttons[i]?.pressed;
      if (now && !this.prevPad.get(i)) this.actions.push(action);
      this.prevPad.set(i, now);
    }
  }

  takeActions(): UiAction[] {
    const a = this.actions;
    this.actions = [];
    return a;
  }

  readPad(): PadState | null {
    const p = this.gamepad();
    if (!p) return null;
    const ax = (i: number): number => p.axes[i] ?? 0;
    const btn = (i: number, threshold = 0.3): boolean => {
      const b = p.buttons[i];
      return !!b && (b.pressed || b.value > threshold);
    };
    // Standard mapping: 4 LB (L1), 6 LT (L2), 5 RB (R1), 7 RT (R2), 0 A, 1 B, 2 X, 3 Y, 13 D-down.
    return {
      lx: ax(0),
      ly: ax(1),
      rx: ax(2),
      ry: ax(3),
      liftUp: btn(4),
      liftDown: btn(6),
      intakeIn: btn(5),
      intakeOut: btn(7),
      gripPin: btn(0),
      gripCup: btn(1),
      tool: btn(2),
      wrist: btn(3),
      align: btn(13),
    };
  }

  readKeys(): KeyState {
    const k = (...codes: string[]): boolean => codes.some((c) => this.down.has(c));
    const axis = (pos: boolean, neg: boolean): number => (pos ? 1 : 0) - (neg ? 1 : 0);
    const buttons: ButtonState = {
      ...NO_BUTTONS,
      liftUp: k('KeyR'),
      liftDown: k('KeyF'),
      intakeIn: k('Space'),
      intakeOut: k('ShiftLeft', 'ShiftRight'),
      gripPin: k('KeyJ'),
      gripCup: k('KeyK'),
      wrist: k('KeyL'),
      tool: k('KeyT'),
      align: k('KeyV'),
    };
    return {
      ...buttons,
      fwd: axis(k('KeyW', 'ArrowUp'), k('KeyS', 'ArrowDown')),
      strafe: axis(k('KeyD'), k('KeyA')),
      turn: axis(k('KeyE', 'ArrowRight'), k('KeyQ', 'ArrowLeft')),
    };
  }
}
