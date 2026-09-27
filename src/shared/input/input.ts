import type { KeyState, PadState } from './mapping';

export type UiAction = 'start' | 'restart' | 'menu';

const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyF', 'KeyR',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'Enter',
]);

const isFormField = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.tagName === 'BUTTON');

const STICK = { lx: 0, ly: 1, rx: 2, ry: 3 };
const BTN = { back: 8, start: 9, rb: 5, lt: 6, rt: 7 };

/** Samples keyboard + the first connected gamepad. UI actions are edge-triggered and queued. */
export class InputManager {
  /** When true, game keys don't scroll or activate focused controls. */
  gameActive = false;
  padName: string | null = null;
  private down = new Set<string>();
  private actions: UiAction[] = [];
  private prevStart = false;
  private prevBack = false;

  constructor() {
    window.addEventListener('keydown', (e) => {
      const inForm = isFormField(e.target) && !this.gameActive;
      if (inForm && e.code !== 'Escape') return;
      this.down.add(e.code);
      if (!e.repeat) {
        if (e.code === 'Enter' || e.code === 'NumpadEnter') this.actions.push('start');
        else if (e.code === 'KeyR') this.actions.push('restart');
        else if (e.code === 'Escape') this.actions.push('menu');
      }
      if (this.gameActive && GAME_KEYS.has(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
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
    const start = !!p?.buttons[BTN.start]?.pressed;
    const back = !!p?.buttons[BTN.back]?.pressed;
    if (start && !this.prevStart) this.actions.push('start');
    if (back && !this.prevBack) this.actions.push('restart');
    this.prevStart = start;
    this.prevBack = back;
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
    return {
      lx: ax(STICK.lx),
      ly: ax(STICK.ly),
      rx: ax(STICK.rx),
      ry: ax(STICK.ry),
      intake: btn(BTN.rt),
      outtake: btn(BTN.lt),
      align: btn(BTN.rb),
    };
  }

  readKeys(): KeyState {
    const k = (...codes: string[]): boolean => codes.some((c) => this.down.has(c));
    const axis = (pos: boolean, neg: boolean): number => (pos ? 1 : 0) - (neg ? 1 : 0);
    return {
      fwd: axis(k('KeyW', 'ArrowUp'), k('KeyS', 'ArrowDown')),
      strafe: axis(k('KeyD'), k('KeyA')),
      turn: axis(k('KeyE', 'ArrowRight'), k('KeyQ', 'ArrowLeft')),
      intake: k('Space'),
      outtake: k('ShiftLeft', 'ShiftRight'),
      align: k('KeyF'),
    };
  }
}
