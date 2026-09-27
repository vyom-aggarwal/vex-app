import type { LiftType, MotorW, RobotSpec, ToolType } from '../shared/types';

/**
 * Pure mechanism kinematics, in inches in the robot frame (+x forward, +y left, z up from the tiles).
 * Lift position s ∈ [0, 1]; the effector point is where a held piece's center sits.
 */

export const EFFECTOR_MIN_Z = 3.25;
export const CHASSIS_BASE = 5.4; // top of the drive base (in)
export const CLEARANCE = 0.4;

const VERTICAL: LiftType[] = ['dr4b', 'cascade', 'sixbar'];

export function liftRange(spec: RobotSpec): { zMin: number; zMax: number } {
  if (spec.lift.type === 'none' || spec.lift.motors.length === 0) return { zMin: EFFECTOR_MIN_Z, zMax: EFFECTOR_MIN_Z };
  return { zMin: EFFECTOR_MIN_Z, zMax: Math.max(EFFECTOR_MIN_Z + 1, spec.lift.maxHeight) };
}

/** Effector point for lift position s. */
export function effectorPoint(spec: RobotSpec, s: number): { x: number; z: number } {
  const { zMin, zMax } = liftRange(spec);
  const front = spec.chassis.length / 2 + 2.2;
  if (zMax === zMin || VERTICAL.includes(spec.lift.type)) return { x: front, z: zMin + (zMax - zMin) * s };
  // Arc lifts sweep ±60° about a pivot so the end stays near the front at both extremes.
  const th0 = Math.PI / 3;
  const R = (zMax - zMin) / (2 * Math.sin(th0));
  const pz = (zMax + zMin) / 2;
  const px = front - R * Math.cos(th0);
  const th = -th0 + 2 * th0 * s;
  return { x: px + R * Math.cos(th), z: pz + R * Math.sin(th) };
}

/** Arm pivot (for rendering arc lifts). */
export function armPivot(spec: RobotSpec): { x: number; z: number; r: number } | null {
  if (VERTICAL.includes(spec.lift.type) || spec.lift.type === 'none') return null;
  const { zMin, zMax } = liftRange(spec);
  const th0 = Math.PI / 3;
  const R = (zMax - zMin) / (2 * Math.sin(th0));
  return { x: spec.chassis.length / 2 + 2.2 - R * Math.cos(th0), z: (zMax + zMin) / 2, r: R };
}

const watts = (m: MotorW[]): number => m.reduce((a, w) => a + w, 0);

const LIFT_FACTOR: Record<LiftType, number> = { none: 0, arm: 1.3, fourbar: 1.2, dr4b: 1, sixbar: 0.9, chainbar: 1.1, cascade: 1.2 };

/** Lift speed in s-units per second. EST: ~14 in/s per 11 W, scaled by mechanism. */
export function liftRate(spec: RobotSpec): number {
  const { zMin, zMax } = liftRange(spec);
  if (zMax <= zMin) return 0;
  const inPerSec = 14 * Math.sqrt(watts(spec.lift.motors) / 11) * LIFT_FACTOR[spec.lift.type] * 1.6;
  return inPerSec / (zMax - zMin);
}

/** Wrist flip / claw actuation time (s). */
export function actuationTime(spec: RobotSpec, what: 'wrist' | 'claw'): number {
  const pneu = spec.effector.actuation === 'pneumatic';
  if (what === 'wrist') return pneu ? 0.15 : spec.effector.motors.length > 0 ? 0.35 : Infinity;
  return pneu ? 0.06 : 0.15;
}

/** Actuations available from the air supply. EST: ~30 single-cylinder strokes per tank at 100 psi. */
export function pneumaticBudget(spec: RobotSpec): number {
  const cyl = Math.max(1, spec.pneumatics.cylinders);
  return Math.floor((spec.pneumatics.tanks * 30 * 2) / (1 + cyl));
}

export function storageCapacity(spec: RobotSpec): number {
  switch (spec.intake.type) {
    case 'conveyor':
      return 2;
    case 'flex':
    case 'floorclaw':
      return 1;
    default:
      return 0;
  }
}

/** Held-piece slots the end effector provides. */
export function effectorSlots(spec: RobotSpec): ('any' | 'pin' | 'cup')[] {
  return spec.effector.type === 'claw' ? ['any'] : ['pin', 'cup'];
}

/** Largest nested unit the effector can carry (pieces). */
export const maxUnitSize = (spec: RobotSpec): number => (spec.effector.type === 'stack' ? 12 : 2);

export const TOOL: Record<ToolType, { reach: number; time: number; pneumatic: boolean }> = {
  none: { reach: 0.8, time: 0.8, pneumatic: false },
  wedge: { reach: 4, time: 0.45, pneumatic: false },
  spinner: { reach: 3, time: 0.35, pneumatic: false },
  flipper: { reach: 6, time: 0.15, pneumatic: true },
};

/** Robot-frame x extents of the robot including anything reaching past the chassis. */
export function footprintX(spec: RobotSpec, s: number): { min: number; max: number } {
  const e = effectorPoint(spec, s);
  const back = spec.intake.mount !== 'front' && spec.intake.type !== 'none' ? 1.5 : 0;
  return { min: -spec.chassis.length / 2 - back, max: Math.max(spec.chassis.length / 2, e.x + 1.6) };
}

/** Current robot height (in): the larger of the chassis and the raised effector. */
export function robotHeight(spec: RobotSpec, s: number): number {
  return Math.max(spec.chassis.height, effectorPoint(spec, s).z + 2);
}
