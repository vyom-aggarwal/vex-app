import { clamp } from '../shared/math';
import { G, inToM, mpsToFps } from '../shared/units';
import type { MotorW, RobotSpec } from '../shared/types';

/**
 * Pure planar drivetrain model (no Rapier). The engine applies wheelForces() to the chassis body each tick,
 * and the builder integrates the same function to show derived top speed / turn rate, so they agree.
 * Robot frame: +x forward, +y left. Angles in radians, SI units.
 */

/** V5 Smart Motor: stall torque 2.1 N·m with the 100 rpm cartridge, scaling inversely with cartridge speed. EST. */
export const STALL_TORQUE_100 = 2.1;
export const motorStallTorque = (cartRpm: number, w: MotorW): number => STALL_TORQUE_100 * (100 / cartRpm) * (w === 11 ? 1 : 0.5);

/** Theoretical (unlimited) stall torque over the current-limited torque. 2 → peak power ≈ 11 W. EST. */
export const MOTOR_T0_RATIO = 2;

/** Friction coefficients (EST). */
export const MU = {
  tractionLong: 1.1,
  tractionLat: 1.0,
  omniLong: 0.9,
  omniLat: 0.12,
  rolling: 0.035,
};
/** Lateral slip speed (m/s) at which wheel side force saturates. */
const LAT_SLIP = 0.03;
const ROLL_SLIP = 0.04;

export interface Wheel {
  x: number;
  y: number;
  /** Rolling direction in the robot frame. */
  dir: number;
  omni: boolean;
  group: number;
}

export interface DriveModel {
  wheels: Wheel[];
  /** Per wheel: stall force at full voltage (N) and free surface speed (m/s). */
  stallForce: number[];
  freeSpeed: number[];
  groups: number;
  mass: number;
  inertia: number;
  normal: number;
  kind: RobotSpec['drive']['type'];
}

export function estimateMassKg(spec: RobotSpec): number {
  const motors = countMotors(spec);
  const lift = spec.lift.type === 'none' ? 0 : spec.lift.type === 'arm' || spec.lift.type === 'fourbar' ? 0.6 : 0.9;
  const wheels = driveWheelCount(spec);
  return (
    1.5 +
    0.008 * spec.chassis.length * spec.chassis.width +
    0.16 * motors +
    0.1 * wheels +
    lift +
    (spec.intake.type === 'none' ? 0 : 0.35) +
    0.3 +
    0.25 * spec.pneumatics.tanks
  );
}

export function driveWheelCount(spec: RobotSpec): number {
  const d = spec.drive;
  if (d.type === 'xdrive' || d.type === 'mecanum') return 4;
  return d.wheelsPerSide * 2 + (d.type === 'hdrive' ? 1 : 0);
}

export function countMotors(spec: RobotSpec): number {
  return (
    spec.drive.motorsPerSide.length * 2 +
    (spec.drive.type === 'hdrive' ? spec.drive.strafeMotors.length : 0) +
    spec.intake.motors.length +
    spec.lift.motors.length +
    spec.effector.motors.length +
    spec.tool.motors.length
  );
}

const sumTorque = (motors: MotorW[], cart: number): number => motors.reduce((a, w) => a + motorStallTorque(cart, w), 0);

export function buildDriveModel(spec: RobotSpec): DriveModel {
  const d = spec.drive;
  const L = inToM(spec.chassis.length);
  const W = inToM(spec.chassis.width);
  const r = inToM(d.wheelDia) / 2;
  const wheelRpm = d.cartridge * d.ratio;
  const vFree = ((wheelRpm * 2 * Math.PI) / 60) * r;
  const inset = inToM(1.5);
  const wheels: Wheel[] = [];
  const groupTorque: number[] = [];
  let groups = 0;

  if (d.type === 'tank' || d.type === 'hdrive') {
    const n = d.wheelsPerSide;
    for (const [side, sy] of [
      [0, 1],
      [1, -1],
    ] as const) {
      for (let i = 0; i < n; i++) {
        const x = L / 2 - inset - (i * (L - 2 * inset)) / (n - 1);
        wheels.push({ x, y: sy * (W / 2 - inset), dir: 0, omni: d.type === 'hdrive' || (d.omni[i] ?? true), group: side });
      }
      // Torque at the wheels = motor torque / ratio (ratio is wheel rpm / motor rpm).
      groupTorque[side] = sumTorque(d.motorsPerSide, d.cartridge) / d.ratio;
    }
    groups = 2;
    if (d.type === 'hdrive') {
      wheels.push({ x: 0, y: 0, dir: -Math.PI / 2, omni: true, group: 2 });
      groupTorque[2] = sumTorque(d.strafeMotors, d.cartridge) / d.ratio;
      groups = 3;
    }
  } else {
    // X-drive / mecanum: FL, FR, BL, BR, one motor each. Rolling directions are tangential at 45°.
    const hx = L / 2 - inset;
    const hy = W / 2 - inset;
    const s2 = Math.SQRT1_2;
    const corners: [number, number, number, number][] = [
      [hx, hy, s2, -s2],
      [hx, -hy, s2, s2],
      [-hx, hy, s2, s2],
      [-hx, -hy, s2, -s2],
    ];
    const motorOf = [d.motorsPerSide[0], d.motorsPerSide[0], d.motorsPerSide[1] ?? d.motorsPerSide[0], d.motorsPerSide[1] ?? d.motorsPerSide[0]];
    corners.forEach(([x, y, dx, dy], i) => {
      wheels.push({ x, y, dir: Math.atan2(dy, dx), omni: true, group: i });
      const eff = d.type === 'mecanum' ? 0.9 : 1;
      groupTorque[i] = (motorOf[i] ? motorStallTorque(d.cartridge, motorOf[i]) : 0) / d.ratio * eff;
    });
    groups = 4;
  }

  const perGroup = new Array(groups).fill(0);
  for (const w of wheels) perGroup[w.group]++;
  const mass = estimateMassKg(spec);
  return {
    wheels,
    stallForce: wheels.map((w) => groupTorque[w.group] / r / perGroup[w.group]),
    freeSpeed: wheels.map(() => vFree),
    groups,
    mass,
    inertia: (mass * (L * L + W * W)) / 12,
    normal: (mass * G) / wheels.length,
    kind: d.type,
  };
}

/** Motor voltage per group (-1..1) from a robot-frame request. turn > 0 = clockwise (turn right). */
export function groupVoltages(m: DriveModel, fwd: number, strafe: number, turn: number): number[] {
  const v = new Array(m.groups).fill(0);
  if (m.kind === 'tank' || m.kind === 'hdrive') {
    let l = fwd + turn;
    let r = fwd - turn;
    const k = Math.max(1, Math.abs(l), Math.abs(r));
    l /= k;
    r /= k;
    v[0] = l;
    v[1] = r;
    if (m.kind === 'hdrive') v[2] = clamp(strafe, -1, 1);
    return v;
  }
  // Holonomic: project the desired body twist onto each wheel's rolling direction.
  const vx = fwd;
  const vy = -strafe;
  const w = -turn;
  let max = 1;
  m.wheels.forEach((wh, i) => {
    const rr = Math.hypot(wh.x, wh.y) || 1;
    const tx = (-w * wh.y) / rr;
    const ty = (w * wh.x) / rr;
    const val = (vx + tx) * Math.cos(wh.dir) + (vy + ty) * Math.sin(wh.dir);
    v[i] = val * Math.SQRT2;
    max = Math.max(max, Math.abs(v[i]));
  });
  return v.map((x) => x / max);
}

export interface Planar {
  x: number;
  y: number;
  th: number;
  vx: number;
  vy: number;
  w: number;
}

/** Net world-frame force and yaw moment from all wheels. */
export function wheelForces(m: DriveModel, p: Planar, volts: number[], dt: number): { fx: number; fy: number; mz: number } {
  const c = Math.cos(p.th);
  const s = Math.sin(p.th);
  // Body-frame velocity
  const bvx = c * p.vx + s * p.vy;
  const bvy = -s * p.vx + c * p.vy;
  let fx = 0;
  let fy = 0;
  let mz = 0;
  const share = m.mass / m.wheels.length;
  for (let i = 0; i < m.wheels.length; i++) {
    const wh = m.wheels[i];
    const ux = Math.cos(wh.dir);
    const uy = Math.sin(wh.dir);
    const pvx = bvx - p.w * wh.y;
    const pvy = bvy + p.w * wh.x;
    const vLong = pvx * ux + pvy * uy;
    const vLat = -pvx * uy + pvy * ux;
    const N = m.normal;
    const muLong = wh.omni ? MU.omniLong : MU.tractionLong;
    const muLat = wh.omni ? MU.omniLat : MU.tractionLat;
    const volt = volts[wh.group] ?? 0;
    // V5 motors are current-limited: the linear back-EMF curve has twice the rated stall torque, clipped
    // at the rated torque. That gives full torque up to half speed, ~11 W peak, and hard braking on release.
    let fLong = clamp(MOTOR_T0_RATIO * m.stallForce[i] * (volt - vLong / m.freeSpeed[i]), -m.stallForce[i], m.stallForce[i]);
    fLong = clamp(fLong, -muLong * N, muLong * N);
    fLong -= MU.rolling * N * Math.tanh(vLong / ROLL_SLIP);
    // Saturating side friction, limited so one step never reverses the slip (explicit-integration stability).
    const latCap = Math.min(muLat * N, (share * Math.abs(vLat)) / dt * 0.5);
    const fLat = -Math.sign(vLat) * Math.min(latCap, (muLat * N * Math.abs(vLat)) / LAT_SLIP);
    const bfx = fLong * ux - fLat * uy;
    const bfy = fLong * uy + fLat * ux;
    fx += bfx;
    fy += bfy;
    mz += wh.x * bfy - wh.y * bfx;
  }
  return { fx: c * fx - s * fy, fy: s * fx + c * fy, mz };
}

/** Integrate the planar model alone (no collisions). Used for derived stats and tests. */
export function integratePlanar(m: DriveModel, p: Planar, volts: number[], dt: number): void {
  const f = wheelForces(m, p, volts, dt);
  p.vx += (f.fx / m.mass) * dt;
  p.vy += (f.fy / m.mass) * dt;
  p.w += (f.mz / m.inertia) * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.th += p.w * dt;
}

export interface DerivedStats {
  massKg: number;
  topSpeedFps: number;
  turnDps: number;
  pushLbf: number;
  strafeFps: number;
  /** Launch acceleration from rest (in/s²) and turn acceleration from rest (rad/s²). */
  accelIps2: number;
  turnAccel: number;
  /** Top turn rate in rad/s. */
  turnRads: number;
  wheelRpm: number;
}

function settle(m: DriveModel, fwd: number, strafe: number, turn: number): Planar {
  const p: Planar = { x: 0, y: 0, th: 0, vx: 0, vy: 0, w: 0 };
  const volts = groupVoltages(m, fwd, strafe, turn);
  const dt = 1 / 120;
  for (let i = 0; i < 120 * 4; i++) integratePlanar(m, p, volts, dt);
  return p;
}

export function derivedStats(spec: RobotSpec): DerivedStats {
  const m = buildDriveModel(spec);
  const f = settle(m, 1, 0, 0);
  const t = settle(m, 0, 0, 1);
  const holo = m.kind !== 'tank';
  const st = holo ? settle(m, 0, 1, 0) : null;
  let push = 0;
  m.wheels.forEach((wh, i) => {
    const muLong = wh.omni ? MU.omniLong : MU.tractionLong;
    push += Math.min(m.stallForce[i], muLong * m.normal) * Math.abs(Math.cos(wh.dir));
  });
  const rest: Planar = { x: 0, y: 0, th: 0, vx: 0, vy: 0, w: 0 };
  const f0 = wheelForces(m, rest, groupVoltages(m, 1, 0, 0), 1 / 120);
  const t0 = wheelForces(m, rest, groupVoltages(m, 0, 0, 1), 1 / 120);
  return {
    accelIps2: Math.hypot(f0.fx, f0.fy) / m.mass / 0.0254,
    turnAccel: Math.abs(t0.mz) / m.inertia,
    turnRads: Math.abs(t.w),
    wheelRpm: spec.drive.cartridge * spec.drive.ratio,
    massKg: m.mass,
    topSpeedFps: mpsToFps(Math.hypot(f.vx, f.vy)),
    turnDps: (Math.abs(t.w) * 180) / Math.PI,
    pushLbf: push / 4.448,
    strafeFps: st ? mpsToFps(Math.hypot(st.vx, st.vy)) : 0,
  };
}
