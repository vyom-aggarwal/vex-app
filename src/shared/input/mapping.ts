import { clamp } from '../sim/geometry';
import type { Alliance, Drivetrain, RobotCommand } from '../sim/types';

/** Pure driver-input → RobotCommand mapping (no DOM), so it can be tested headlessly. */

export type DriveMode = 'tank' | 'arcade' | 'split';
export type Curve = 'linear' | 'cubic';

export interface DriverTuning {
  driveMode: DriveMode;
  deadzone: number;
  curve: Curve;
  maxSpeed: number;
  fieldCentric: boolean;
  autoIntake: boolean;
  alignAssist: boolean;
  autoScore: boolean;
}

/** Standard-mapping gamepad sample. Stick Y is +down, as browsers report it. */
export interface PadState {
  lx: number;
  ly: number;
  rx: number;
  ry: number;
  intake: boolean;
  outtake: boolean;
  align: boolean;
}

/** Keyboard sample: each axis is -1, 0 or 1. strafe: D - A, turn: right - left. */
export interface KeyState {
  fwd: number;
  strafe: number;
  turn: number;
  intake: boolean;
  outtake: boolean;
  align: boolean;
}

/** Keys are all-or-nothing, so keyboard turning is scaled down for control. */
export const KEY_TURN_SCALE = 0.7;

/** Radial deadzone, rescaled so output ramps from 0 at the deadzone edge to 1 at full tilt. */
export function applyDeadzone(x: number, y: number, dz: number): [number, number] {
  const mag = Math.hypot(x, y);
  if (mag <= dz || mag === 0) return [0, 0];
  const scaled = Math.min(1, (mag - dz) / (1 - dz));
  return [(x / mag) * scaled, (y / mag) * scaled];
}

export function applyCurve(v: number, curve: Curve): number {
  return curve === 'cubic' ? v * v * v : v;
}

export function mapDriverInput(
  pad: PadState | null,
  keys: KeyState,
  t: DriverTuning,
  drivetrain: Drivetrain,
  alliance: Alliance,
): RobotCommand {
  const holo = drivetrain === 'xdrive';
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
  if (holo) {
    strafe += keys.strafe;
    turn += keys.turn * KEY_TURN_SCALE;
  } else {
    // A tank drive can't strafe: A/D turn instead.
    turn += clamp(keys.turn + keys.strafe, -1, 1) * KEY_TURN_SCALE;
  }
  fwd = clamp(fwd, -1, 1) * t.maxSpeed;
  strafe = holo ? clamp(strafe, -1, 1) * t.maxSpeed : 0;
  turn = clamp(turn, -1, 1) * t.maxSpeed;

  let field: RobotCommand['field'] = null;
  if (holo && t.fieldCentric) {
    // Driver-view forward is away from the driver wall: -y for red, +y for blue.
    const sgn = alliance === 'red' ? -1 : 1;
    field = { x: sgn * strafe, y: sgn * fwd };
  }
  return {
    fwd,
    strafe,
    turn,
    field,
    intake: keys.intake || (pad?.intake ?? false),
    outtake: keys.outtake || (pad?.outtake ?? false),
    align: t.alignAssist && (keys.align || (pad?.align ?? false)),
    autoIntake: t.autoIntake,
    autoScore: t.autoScore,
  };
}
