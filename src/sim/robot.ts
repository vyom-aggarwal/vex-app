import { clamp, wrapAngle } from './geometry';
import type { LocalBox, RobotConfig, RobotDerived, Wheel } from './types';

export const IN_PER_M = 39.3701;
const GRAVITY = 9.81;
/** Assumed competition robot mass (~15 lb). */
export const ROBOT_MASS_KG = 6.8;
/** Wheel-on-foam-tile friction coefficient. */
export const WHEEL_MU = 0.9;
/** Time constant for traction wheels killing sideways slide, s. */
const LATERAL_TAU = 0.03;
/** V5 Smart Motor stall torque at the cartridge output, N*m. */
export const STALL_TORQUE_NM: Readonly<Record<number, number>> = { 100: 2.1, 200: 1.05, 600: 0.35 };
export const CARTRIDGES = [100, 200, 600] as const;
export const WHEEL_DIAMETERS = [2.75, 3.25, 4] as const;
export const MOTOR_COUNTS = [4, 6, 8] as const;
export const GEAR_RATIOS: ReadonlyArray<{ label: string; value: number }> = [
  { label: '36:60 (0.60x)', value: 36 / 60 },
  { label: '48:72 (0.67x)', value: 48 / 72 },
  { label: '36:48 (0.75x)', value: 36 / 48 },
  { label: '1:1 (direct)', value: 1 },
  { label: '48:36 (1.33x)', value: 48 / 36 },
  { label: '60:36 (1.67x)', value: 60 / 36 },
];
export const MIN_SIZE = 10;
export const MAX_SIZE = 18;
/** How far a deployed extended intake sticks out past the chassis, inches. */
export const EXTENDED_REACH = 5;
/** Turn scrub range for Robot Setup. */
export const MAX_TURN_SCRUB = 0.8;
const NOMINAL_DT = 1 / 120;

export const DEFAULT_ROBOT_CONFIG: Readonly<RobotConfig> = {
  drivetrain: 'tank',
  cartridgeRpm: 600,
  gearRatio: 36 / 48,
  wheelDiameter: 3.25,
  motorCount: 6,
  width: 15,
  length: 16,
  intakeStyle: 'compact',
  capacity: 2,
  // Default tank: 731 deg/s ideal -> ~329 deg/s after scrub.
  turnScrub: 0.55,
};

function pick<T>(v: unknown, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly unknown[]).includes(v) ? (v as T) : fallback;
}

function num(v: unknown, lo: number, hi: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : fallback;
}

/** Coerce anything (e.g. parsed localStorage) into a legal RobotConfig. */
export function sanitizeRobotConfig(raw: unknown): RobotConfig {
  const c = (raw !== null && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_ROBOT_CONFIG;
  const gr = c.gearRatio;
  const ratio = typeof gr === 'number' ? GEAR_RATIOS.find((g) => Math.abs(g.value - gr) < 1e-6) : undefined;
  return {
    drivetrain: pick(c.drivetrain, ['tank', 'xdrive'] as const, d.drivetrain),
    cartridgeRpm: pick(c.cartridgeRpm, CARTRIDGES, d.cartridgeRpm),
    gearRatio: ratio ? ratio.value : d.gearRatio,
    wheelDiameter: pick<number>(c.wheelDiameter, WHEEL_DIAMETERS, d.wheelDiameter),
    motorCount: pick(c.motorCount, MOTOR_COUNTS, d.motorCount),
    width: num(c.width, MIN_SIZE, MAX_SIZE, d.width),
    length: num(c.length, MIN_SIZE, MAX_SIZE, d.length),
    intakeStyle: pick(c.intakeStyle, ['compact', 'extended'] as const, d.intakeStyle),
    capacity: Math.round(num(c.capacity, 1, 3, d.capacity)),
    turnScrub: num(c.turnScrub, 0, MAX_TURN_SCRUB, d.turnScrub),
  };
}

/** Physical parameters derived from a config: wheel layout, motor forces, footprint, headline stats. */
export function deriveRobot(c: RobotConfig): RobotDerived {
  const wheelRpm = c.cartridgeRpm * c.gearRatio;
  const wheelFreeSpeed = (wheelRpm / 60) * Math.PI * c.wheelDiameter;
  const wheelRadiusM = c.wheelDiameter / 2 / IN_PER_M;
  const stallForcePerMotor = (STALL_TORQUE_NM[c.cartridgeRpm] ?? 1.05) / c.gearRatio / wheelRadiusM;
  const massKg = ROBOT_MASS_KG;
  const wM = c.width / IN_PER_M;
  const lM = c.length / IN_PER_M;
  const inertia = (massKg * (wM * wM + lM * lM)) / 12;
  const holo = c.drivetrain === 'xdrive';

  const wheels: Wheel[] = [];
  if (!holo) {
    // Tank: each side is one wheel group on the side rail.
    const ty = c.width / 2 - 1.5;
    for (const side of [1, -1]) {
      wheels.push({ px: 0, py: side * ty, dx: 1, dy: 0, cf: 1, cs: 0, ct: -side, motors: c.motorCount / 2 });
    }
  } else {
    // X-drive: omni wheels at the corners, rolling at 45 degrees.
    const ax = c.length / 2 - 2;
    const ay = c.width / 2 - 2;
    const k = Math.SQRT1_2;
    const corners: [number, number, number, number][] = [
      [ax, ay, k, -k],
      [ax, -ay, k, k],
      [-ax, ay, k, k],
      [-ax, -ay, k, -k],
    ];
    for (const [px, py, dx, dy] of corners) {
      const lever = dx * -py + dy * px;
      wheels.push({ px, py, dx, dy, cf: Math.sign(dx), cs: Math.sign(dy), ct: Math.sign(lever), motors: c.motorCount / 4 });
    }
  }

  const shapes: LocalBox[] = [{ cx: 0, cy: 0, hx: c.length / 2, hy: c.width / 2 }];
  let frontOffset = c.length / 2;
  let intakeZone: LocalBox;
  if (c.intakeStyle === 'extended') {
    shapes.push({ cx: c.length / 2 + EXTENDED_REACH / 2, cy: 0, hx: EXTENDED_REACH / 2, hy: c.width * 0.4 });
    frontOffset += EXTENDED_REACH;
    intakeZone = { cx: frontOffset + 1.5, cy: 0, hx: 2.5, hy: c.width / 2 };
  } else {
    intakeZone = { cx: frontOffset + 1.25, cy: 0, hx: 2.25, hy: c.width / 2 - 1 };
  }

  const topSpeed = holo ? wheelFreeSpeed * Math.SQRT2 : wheelFreeSpeed;
  let maxLever = 0;
  for (const w of wheels) maxLever = Math.max(maxLever, Math.abs(w.dx * -w.py + w.dy * w.px));
  const freeTurnRate = wheelFreeSpeed / maxLever;
  const tractionPerWheel = (WHEEL_MU * massKg * GRAVITY) / wheels.length;
  // Wheel scrub: tread dragged sideways while turning. Modeled as viscous yaw drag sized so a
  // full turn command settles at (1 - turnScrub) of the ideal turn rate (unless traction caps it first).
  let turnTorque = 0;
  let tractionTorque = 0;
  for (const w of wheels) {
    const lev = Math.abs(w.dx * -w.py + w.dy * w.px) / IN_PER_M;
    turnTorque += w.motors * stallForcePerMotor * lev;
    tractionTorque += tractionPerWheel * lev;
  }
  const scrub = c.turnScrub;
  const yawDrag = scrub > 0 ? (turnTorque * scrub) / ((1 - scrub) * freeTurnRate) : 0;
  const maxTurnRate = yawDrag > 0 ? Math.min(freeTurnRate * (1 - scrub), tractionTorque / yawDrag) : freeTurnRate;
  let launch = 0;
  for (const w of wheels) launch += Math.min(w.motors * stallForcePerMotor, tractionPerWheel) * Math.abs(w.dx);
  const peakAccel = (launch / massKg) * IN_PER_M;

  // The back-EMF term is stiff for slow, high-torque gearing; substep so explicit Euler stays stable.
  const vmaxM = wheelFreeSpeed / IN_PER_M;
  let linRate = 0;
  let rotRate = 0;
  for (const w of wheels) {
    const kf = (w.motors * stallForcePerMotor) / vmaxM;
    const lev = Math.abs(w.dx * -w.py + w.dy * w.px) / IN_PER_M;
    linRate += kf / massKg;
    rotRate += (kf * lev * lev) / inertia;
  }
  rotRate += yawDrag / inertia;
  const rate = Math.max(linRate, rotRate, 1 / LATERAL_TAU);
  const substeps = clamp(Math.ceil((rate * NOMINAL_DT) / 0.3), 1, 24);

  const d: RobotDerived = {
    massKg,
    inertia,
    wheelRpm,
    wheelFreeSpeed,
    topSpeed,
    maxTurnRate,
    yawDrag,
    peakAccel,
    timeToTop: 0,
    stallForcePerMotor,
    tractionPerWheel,
    lateralGrip: !holo,
    substeps,
    wheels,
    shapes,
    intakeZone,
    frontOffset,
  };

  const body: DriveBody = { x: 0, y: 0, theta: 0, vx: 0, vy: 0, omega: 0 };
  const cmds = mixWheels(d, 1, 0, 0, []);
  let t = 0;
  while (t < 10 && body.vx < 0.95 * topSpeed) {
    integrateDrive(body, d, cmds, NOMINAL_DT);
    t += NOMINAL_DT;
  }
  d.timeToTop = t;
  return d;
}

/**
 * Mix normalized chassis commands into per-wheel commands, then apply motor-saturation
 * normalization: if any wheel would exceed 100%, all wheels scale down together so the
 * requested direction of motion is preserved.
 */
export function mixWheels(d: RobotDerived, fwd: number, strafeLeft: number, ccw: number, out: number[]): number[] {
  let max = 1;
  out.length = d.wheels.length;
  for (let i = 0; i < d.wheels.length; i++) {
    const w = d.wheels[i];
    const v = fwd * w.cf + strafeLeft * w.cs + ccw * w.ct;
    out[i] = v;
    max = Math.max(max, Math.abs(v));
  }
  if (max > 1) for (let i = 0; i < out.length; i++) out[i] /= max;
  return out;
}

export interface DriveBody {
  x: number;
  y: number;
  theta: number;
  vx: number;
  vy: number;
  omega: number;
}

/**
 * DC-motor drivetrain model. Each wheel pushes with
 *   F = motors * stallForce * (command - wheelSpeed / freeSpeed)
 * (applied voltage minus back-EMF), clamped to the wheel's traction limit.
 * Forces and torques integrate into chassis velocity; traction wheels also resist sideways slide.
 */
export function integrateDrive(b: DriveBody, d: RobotDerived, cmds: readonly number[], dt: number): void {
  const h = dt / d.substeps;
  const vmax = d.wheelFreeSpeed;
  const toAccel = IN_PER_M / d.massKg;
  const maxLat = WHEEL_MU * d.massKg * GRAVITY;
  for (let n = 0; n < d.substeps; n++) {
    const c = Math.cos(b.theta);
    const s = Math.sin(b.theta);
    let u = b.vx * c + b.vy * s;
    let w = -b.vx * s + b.vy * c;
    const om = b.omega;
    let fu = 0;
    let fw = 0;
    let tq = 0;
    for (let i = 0; i < d.wheels.length; i++) {
      const wh = d.wheels[i];
      const vi = wh.dx * (u - om * wh.py) + wh.dy * (w + om * wh.px);
      const f = clamp(
        wh.motors * d.stallForcePerMotor * ((cmds[i] ?? 0) - vi / vmax),
        -d.tractionPerWheel,
        d.tractionPerWheel,
      );
      fu += f * wh.dx;
      fw += f * wh.dy;
      tq += (wh.px * f * wh.dy - wh.py * f * wh.dx) / IN_PER_M;
    }
    tq -= d.yawDrag * om;
    if (d.lateralGrip) fw += clamp(((-w / LATERAL_TAU) * d.massKg) / IN_PER_M, -maxLat, maxLat);
    u += fu * toAccel * h;
    w += fw * toAccel * h;
    b.omega = om + (tq / d.inertia) * h;
    b.vx = u * c - w * s;
    b.vy = u * s + w * c;
    b.theta = wrapAngle(b.theta + b.omega * h);
    b.x += b.vx * h;
    b.y += b.vy * h;
  }
}
