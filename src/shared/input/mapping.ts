import { clamp } from '../math';
import { ASSIST, type Alliance, type DriveType, type RobotCommand } from '../types';

/** Pure driver-input → RobotCommand mapping (no DOM), so it can be tested headlessly. */

export type DriveMode = 'tank' | 'arcade' | 'split';
/** Stick response exponent: 1 = linear, 3 = cubic (fine control near center). */
export type Curve = number;

export interface DriverTuning {
  driveMode: DriveMode;
  deadzone: number;
  curve: Curve;
  maxSpeed: number;
  fieldCentric: boolean;
  assistAlign: boolean;
  assistGrab: boolean;
  assistPlace: boolean;
  assistTool: boolean;
  /** Raise/lower the lift automatically near goals and pieces. */
  assistLift: boolean;
  /** Keyboard turn power (0..1) when turning in place; arcs use 60% of this while driving. */
  keyTurn: number;
}

export const DEFAULT_TUNING: DriverTuning = {
  driveMode: 'split',
  deadzone: 0.08,
  curve: 1,
  maxSpeed: 1,
  fieldCentric: false,
  assistAlign: true,
  assistGrab: false,
  assistPlace: true,
  assistLift: true,
  assistTool: false,
  keyTurn: 0.7,
};

/** Mechanism buttons shared by keyboard and gamepad samples. */
export interface ButtonState {
  liftUp: boolean;
  liftDown: boolean;
  intakeIn: boolean;
  intakeOut: boolean;
  gripPin: boolean;
  gripCup: boolean;
  wrist: boolean;
  tool: boolean;
  align: boolean;
}

export const NO_BUTTONS: ButtonState = {
  liftUp: false,
  liftDown: false,
  intakeIn: false,
  intakeOut: false,
  gripPin: false,
  gripCup: false,
  wrist: false,
  tool: false,
  align: false,
};

/** Standard-mapping gamepad sample. Stick Y is +down, as browsers report it. */
export interface PadState extends ButtonState {
  lx: number;
  ly: number;
  rx: number;
  ry: number;
}

/** Keyboard sample: each axis is -1, 0 or 1. strafe: D - A, turn: right - left. */
export interface KeyState extends ButtonState {
  fwd: number;
  strafe: number;
  turn: number;
}

/** Keys are all-or-nothing, so keyboard turning is scaled down for control. */
export const KEY_TURN_SCALE = 0.7;

export const isHolonomic = (d: DriveType): boolean => d !== 'tank';

/** Radial deadzone, rescaled so output ramps from 0 at the deadzone edge to 1 at full tilt. */
export function applyDeadzone(x: number, y: number, dz: number): [number, number] {
  const mag = Math.hypot(x, y);
  if (mag <= dz || mag === 0) return [0, 0];
  const scaled = Math.min(1, (mag - dz) / (1 - dz));
  return [(x / mag) * scaled, (y / mag) * scaled];
}

export function applyCurve(v: number, curve: Curve): number {
  const e = typeof curve === 'number' && curve >= 1 ? curve : 1;
  return Math.sign(v) * Math.abs(v) ** e;
}

export function assistMask(t: DriverTuning): number {
  return (
    (t.assistAlign ? ASSIST.align : 0) |
    (t.assistGrab ? ASSIST.autoGrab : 0) |
    (t.assistPlace ? ASSIST.autoPlace : 0) |
    (t.assistTool ? ASSIST.toolHelper : 0) |
    (t.assistLift ? ASSIST.autoLift : 0)
  );
}

/**
 * Field-centric "forward" is away from the driver's wall. Red stands at +y, so forward is -y for red.
 * Returns field-axis translation for a driver-view (strafe, fwd) request.
 */
export function driverToField(strafe: number, fwd: number, alliance: Alliance): { x: number; y: number } {
  const sgn = alliance === 'red' ? -1 : 1;
  // Red faces -y: driver-right is -x. Blue faces +y: driver-right is +x.
  return { x: sgn * strafe, y: sgn * fwd };
}

export function mapDriverInput(
  pad: PadState | null,
  keys: KeyState,
  t: DriverTuning,
  drive: DriveType,
  alliance: Alliance,
): RobotCommand {
  const holo = isHolonomic(drive);
  let fwd = 0;
  let strafe = 0;
  let turn = 0;
  if (pad) {
    const [lx0, ly0] = applyDeadzone(pad.lx, pad.ly, t.deadzone);
    const [rx0, ry0] = applyDeadzone(pad.rx, pad.ry, t.deadzone);
    const lx = applyCurve(lx0, t.curve);
    const ly = applyCurve(-ly0, t.curve);
    const rx = applyCurve(rx0, t.curve);
    const ry = applyCurve(-ry0, t.curve);
    switch (t.driveMode) {
      case 'tank':
        fwd = (ly + ry) / 2;
        turn = (ly - ry) / 2;
        strafe = (lx + rx) / 2;
        break;
      case 'arcade':
        fwd = ly;
        turn = lx;
        strafe = rx;
        break;
      case 'split':
        fwd = ly;
        turn = rx;
        strafe = lx;
        break;
    }
  }
  fwd += keys.fwd;
  // Keys are all-or-nothing: turn more gently while also driving so arcs stay controllable.
  const kt = (t.keyTurn ?? KEY_TURN_SCALE) * (Math.abs(keys.fwd) > 0.05 ? 0.6 : 1);
  if (holo) {
    strafe += keys.strafe;
    turn += keys.turn * kt;
  } else {
    // A tank drive can't strafe: A/D turn instead.
    turn += clamp(keys.turn + keys.strafe, -1, 1) * kt;
  }
  fwd = clamp(fwd, -1, 1) * t.maxSpeed;
  strafe = holo ? clamp(strafe, -1, 1) * t.maxSpeed : 0;
  turn = clamp(turn, -1, 1) * t.maxSpeed;

  const field = holo && t.fieldCentric ? driverToField(strafe, fwd, alliance) : null;
  const b = (k: keyof ButtonState): boolean => keys[k] || (pad?.[k] ?? false);
  return {
    fwd: field ? 0 : fwd,
    strafe: field ? 0 : strafe,
    turn,
    field,
    lift: (b('liftUp') ? 1 : 0) - (b('liftDown') ? 1 : 0),
    intake: (b('intakeIn') ? 1 : 0) - (b('intakeOut') ? 1 : 0),
    gripPin: b('gripPin'),
    gripCup: b('gripCup'),
    wrist: b('wrist'),
    tool: b('tool'),
    align: b('align'),
    assists: assistMask(t),
  };
}

/**
 * Keyboard ramp: keys jump from 0 to 1, which makes a real drivetrain lurch and slip. Ramp presses in
 * over ~0.12 s but let go instantly, so stopping stays crisp. Gamepad sticks are analog and skip this.
 */
export class KeyRamp {
  private v = { fwd: 0, strafe: 0, turn: 0 };
  constructor(private riseRate = 8) {}

  apply(k: KeyState, dt: number): KeyState {
    const step = (cur: number, target: number): number => {
      if (target === 0) return 0; // release instantly
      const from = Math.sign(cur) === Math.sign(target) ? Math.abs(cur) : 0; // reversing restarts the ramp
      return Math.sign(target) * Math.min(Math.abs(target), from + this.riseRate * dt);
    };
    this.v = { fwd: step(this.v.fwd, k.fwd), strafe: step(this.v.strafe, k.strafe), turn: step(this.v.turn, k.turn) };
    return { ...k, ...this.v };
  }
}
