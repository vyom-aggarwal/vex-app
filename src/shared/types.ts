/** Types shared by the engine, games, bots, renderer and UI. Plain data only, so everything serializes. */

export type GameId = 'override' | 'pinnacle';
export type Alliance = 'red' | 'blue';
export const ALLIANCES: readonly Alliance[] = ['red', 'blue'];
export const other = (a: Alliance): Alliance => (a === 'red' ? 'blue' : 'red');

/** Color of one half of a Pin, or the state a Toggle/Roller shows. */
export type HalfColor = 'red' | 'blue' | 'yellow';
/** Pin types by their two half colors. */
export type PinType = 'RB' | 'RY' | 'BY' | 'YY';
export const PIN_HALVES: Record<PinType, [HalfColor, HalfColor]> = {
  RB: ['red', 'blue'],
  RY: ['red', 'yellow'],
  BY: ['blue', 'yellow'],
  YY: ['yellow', 'yellow'],
};
/** A Cup's two halves: one transparent ("clear"), one opaque (gray). */
export type CupHalf = 'clear' | 'opaque';

// ---------------------------------------------------------------------------------------------
// Robot spec (builder output). All lengths in inches.
// ---------------------------------------------------------------------------------------------

export type DriveType = 'tank' | 'xdrive' | 'mecanum' | 'hdrive';
export type WheelSize = 2.75 | 3.25 | 4;
export type Cartridge = 100 | 200 | 600;
export type MotorW = 11 | 5.5;
export type IntakeType = 'none' | 'flex' | 'conveyor' | 'floorclaw';
export type LiftType = 'none' | 'arm' | 'fourbar' | 'dr4b' | 'sixbar' | 'chainbar' | 'cascade';
export type EffectorType = 'claw' | 'dual' | 'stack';
export type ToolType = 'none' | 'wedge' | 'spinner' | 'flipper';

export interface DriveSpec {
  type: DriveType;
  /** Tank: 2/3/4 per side (4/6/8 wheels). X/mecanum: 2 per side. H-drive: 2 per side plus a center strafe wheel. */
  wheelsPerSide: 2 | 3 | 4;
  wheelDia: WheelSize;
  /** Omni (true) or traction (false) per wheel position, front to back; mirrored on both sides. */
  omni: boolean[];
  cartridge: Cartridge;
  /** External gear ratio as wheel rpm / cartridge rpm (e.g. 36:48 = 0.75). */
  ratio: number;
  /** Motors on each side. X/mecanum: one per wheel, so exactly 2. */
  motorsPerSide: MotorW[];
  /** H-drive center-wheel motors. */
  strafeMotors: MotorW[];
}

export interface RobotSpec {
  v: 1;
  id: string;
  name: string;
  game: GameId;
  chassis: { length: number; width: number; height: number };
  drive: DriveSpec;
  intake: { type: IntakeType; mount: 'front' | 'back' | 'both'; upright: boolean; lying: boolean; motors: MotorW[] };
  lift: { type: LiftType; maxHeight: number; motors: MotorW[] };
  effector: { type: EffectorType; wrist: boolean; actuation: 'motor' | 'pneumatic'; motors: MotorW[] };
  tool: { type: ToolType; motors: MotorW[] };
  pneumatics: { tanks: number; cylinders: number };
  /** Optional identity and appearance (older saved robots lack these). */
  team?: { name: string; number: string };
  look?: { chassis: number; accent: number | null };
}

// ---------------------------------------------------------------------------------------------
// Per-tick inputs
// ---------------------------------------------------------------------------------------------

export const ASSIST = { align: 1, autoGrab: 2, autoPlace: 4, toolHelper: 8 } as const;

/** One robot's command for one tick. Buttons are levels; the engine does its own edge detection. */
export interface RobotCommand {
  /** Robot-frame drive request, each -1..1. */
  fwd: number;
  strafe: number;
  turn: number;
  /** Field-centric translation request in field axes (-1..1), or null for robot-centric. */
  field: { x: number; y: number } | null;
  lift: number;
  intake: number;
  gripPin: boolean;
  gripCup: boolean;
  wrist: boolean;
  tool: boolean;
  /** Held: engage goal auto-align (if the assist is on). */
  align: boolean;
  /** Bitmask of ASSIST flags the driver has enabled. */
  assists: number;
}

export const NEUTRAL_COMMAND: RobotCommand = Object.freeze({
  fwd: 0,
  strafe: 0,
  turn: 0,
  field: null,
  lift: 0,
  intake: 0,
  gripPin: false,
  gripCup: false,
  wrist: false,
  tool: false,
  align: false,
  assists: 0,
}) as RobotCommand;

/** A human-player Match Load request: feed the next piece into a Loader. */
export interface HpCommand {
  alliance: Alliance;
  loader: number;
  pin: PinType | null;
  cup: boolean;
}

export interface TickInput {
  cmds: RobotCommand[];
  hp: HpCommand[];
}

export type ModeId = 'match' | 'match1v1' | 'skills' | 'free' | 'alliance' | 'solo' | 'solocode';

/** Robot entry for a session: who drives it and on which alliance. */
export interface RobotEntry {
  spec: RobotSpec;
  alliance: Alliance;
  /** 'player' is the local driver, 'dummy' a robot that never moves; bots are keyed by style/level. */
  driver: 'player' | 'dummy' | { style: BotStyle; level: BotLevel };
  /** Starting slot index within the game's start positions for this alliance. */
  slot: number;
}
export type BotStyle = 'scorer' | 'controller' | 'defender' | 'mixed';
export type BotLevel = 'easy' | 'normal' | 'hard';
