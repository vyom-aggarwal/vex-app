/**
 * Plain, JSON-serializable sim types. No classes, Maps or functions live in SimState,
 * so a state survives JSON round-trips and can be snapshotted, replayed or sent over a wire.
 */

export type Alliance = 'red' | 'blue';
export type PieceKind = 'cup' | 'pin';
/** Pins are red, blue or yellow; Cups have no color. */
export type PinColor = Alliance | 'yellow';
export type GoalKind = 'tall' | 'short' | 'alliance';
export type GameMode = 'match' | 'skills' | 'free';
export type Phase = 'pre' | 'auton' | 'transition' | 'driver' | 'post' | 'free';
export type Drivetrain = 'tank' | 'xdrive';
export type IntakeStyle = 'compact' | 'extended';
export type StartSide = 'left' | 'right';

export interface RobotConfig {
  drivetrain: Drivetrain;
  /** V5 motor cartridge free speed (rpm). */
  cartridgeRpm: 100 | 200 | 600;
  /** External ratio = wheel rpm / motor rpm (a 36T gear driving a 48T gear = 0.75). */
  gearRatio: number;
  /** Wheel diameter, inches. */
  wheelDiameter: number;
  motorCount: 4 | 6 | 8;
  /** Chassis footprint, inches (starting size limit 18" x 18"). */
  width: number;
  length: number;
  intakeStyle: IntakeStyle;
  /** Max pieces held at once (1-3). */
  capacity: number;
  /** Fraction of free turn speed lost to wheel scrub (0 = ideal, 0.55 = typical 6-wheel tank). */
  turnScrub: number;
}

/** Box in robot frame (x = forward, y = left): center + half extents, inches. */
export interface LocalBox {
  cx: number;
  cy: number;
  hx: number;
  hy: number;
}

/** A driven wheel (or wheel group, for tank sides). */
export interface Wheel {
  /** Contact point in robot frame, inches. */
  px: number;
  py: number;
  /** Unit rolling direction in robot frame. */
  dx: number;
  dy: number;
  /** Command mix coefficients for forward, strafe-left and counter-clockwise turn. */
  cf: number;
  cs: number;
  ct: number;
  motors: number;
}

export interface RobotDerived {
  massKg: number;
  /** Yaw moment of inertia, kg*m^2. */
  inertia: number;
  wheelRpm: number;
  /** Free (no-load) surface speed of one wheel, in/s. */
  wheelFreeSpeed: number;
  /** Max straight-line chassis speed, in/s. */
  topSpeed: number;
  /** Max turn-in-place rate (after wheel scrub), rad/s. */
  maxTurnRate: number;
  /** Viscous yaw drag from wheel scrub, N*m per rad/s. */
  yawDrag: number;
  /** Forward acceleration from rest (traction-limited), in/s^2. */
  peakAccel: number;
  /** Time from rest to 95% of top speed, s. */
  timeToTop: number;
  /** Stall force of one motor at the wheel tread, N. */
  stallForcePerMotor: number;
  /** Max tractive force per wheel before slipping, N. */
  tractionPerWheel: number;
  /** Traction wheels resist sideways sliding; omni/X-drive wheels do not. */
  lateralGrip: boolean;
  /** Integration substeps per sim tick (keeps the stiff motor model stable). */
  substeps: number;
  wheels: Wheel[];
  /** Collision footprint: chassis first, then any deployed intake. */
  shapes: LocalBox[];
  intakeZone: LocalBox;
  /** Distance from robot center to the front of its collision footprint, inches. */
  frontOffset: number;
}

/**
 * One tick of driver intent for one robot. Produced by src/input, consumed by the sim.
 * fwd/strafe/turn are normalized [-1, 1]: fwd = robot forward, strafe = robot right,
 * turn = clockwise (turn right). If `field` is set (X-drive field-centric), it replaces
 * fwd/strafe with a translation vector in field coordinates.
 */
export interface RobotCommand {
  fwd: number;
  strafe: number;
  turn: number;
  field: { x: number; y: number } | null;
  intake: boolean;
  outtake: boolean;
  align: boolean;
  autoIntake: boolean;
  autoScore: boolean;
}

export interface RobotStats {
  scored: number;
  intaked: number;
  toggles: number;
}

export interface Robot {
  id: string;
  alliance: Alliance;
  human: boolean;
  x: number;
  y: number;
  /** Heading, radians CCW from +x. */
  theta: number;
  vx: number;
  vy: number;
  omega: number;
  config: RobotConfig;
  derived: RobotDerived;
  /** Held piece ids, first in = first out. */
  held: number[];
  intakeCooldown: number;
  outtakeCooldown: number;
  intaking: boolean;
  alignTarget: number | null;
  stats: RobotStats;
}

export interface Piece {
  id: number;
  kind: PieceKind;
  /** Pin color; null for Cups. */
  color: PinColor | null;
  x: number;
  y: number;
  r: number;
  state: 'floor' | 'held' | 'scored';
  holder: string | null;
  goal: number | null;
}

export interface Goal {
  id: number;
  label: string;
  kind: GoalKind;
  alliance: Alliance | null;
  x: number;
  y: number;
  r: number;
  /** Post height, inches: the stack may not rise above it. */
  height: number;
  /** Quadrant index (0-3, same index as its Toggle); null for the Midfield Tall Goal. */
  quadrant: number | null;
  /** Piece ids, bottom to top. */
  stack: number[];
}

export interface Toggle {
  id: number;
  /** Point on the wall. */
  x: number;
  y: number;
  /** Unit normal pointing into the field. */
  nx: number;
  ny: number;
  /** Width along the wall and depth into the field, inches. */
  w: number;
  d: number;
  owner: Alliance | null;
  flips: number;
}

export interface GoalScore {
  id: number;
  label: string;
  kind: GoalKind;
  alliance: Alliance | null;
  redPins: number;
  bluePins: number;
  yellowPins: number;
  cups: number;
  /** Pins covered by a Cup (score nothing). */
  covered: number;
  /** Alliance that yellow Pins on this goal score for. */
  yellowOwner: Alliance | null;
  red: number;
  blue: number;
}

export interface AllianceScore {
  /** Scoring alliance-color Pins and their points. */
  pins: number;
  pinPoints: number;
  /** Scoring yellow Pins and their points. */
  yellowPins: number;
  yellowPoints: number;
  /** pinPoints + yellowPoints (what autonomous is judged on). */
  goalPoints: number;
  /** Toggles owned (no points of their own; they decide yellow Pins). */
  toggles: number;
  parked: number;
  midfieldPoints: number;
  autonBonus: number;
  total: number;
}

export interface ScoreBreakdown {
  red: AllianceScore;
  blue: AllianceScore;
  goals: GoalScore[];
  autonWinner: Alliance | 'tie' | null;
}

export interface SimState {
  seed: number;
  /** PRNG state (mulberry32). */
  rng: number;
  tick: number;
  mode: GameMode;
  phase: Phase;
  phaseTick: number;
  autonDrive: boolean;
  playerAlliance: Alliance;
  robots: Robot[];
  /** Indexed by piece id. */
  pieces: Piece[];
  goals: Goal[];
  toggles: Toggle[];
  /** Alliance totals snapshotted at the end of autonomous. */
  autonScore: { red: number; blue: number } | null;
  autonViolation: { red: boolean; blue: boolean };
  finalScore: ScoreBreakdown | null;
}
