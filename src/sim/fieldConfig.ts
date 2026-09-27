import type { Alliance, GoalKind, PinColor, StartSide } from './types';

/**
 * Field geometry and game-rule numbers for "Override" (VEX V5 Robotics Competition 2026-27).
 *
 * Coordinates: inches, origin at field center, +y toward the RED driver wall,
 * +x to the right as seen from the BLUE driver station (red drivers see +x on their left).
 *
 * Every value marked TODO is a plausible, symmetric placeholder, NOT taken from the
 * official game manual. Verify each one before trusting the sim for strategy.
 */

/** Half of the 144" x 144" perimeter (inside of walls). */
export const FIELD_HALF = 72; // TODO: verify against game manual (inside vs. outside perimeter dimension)
export const TILE_SIZE = 24; // standard VEX foam tile

export const PIECE_RADIUS = {
  cup: 2.5, // TODO: verify against game manual
  pin: 1.5, // TODO: verify against game manual
} as const;

/**
 * Quadrants are the four triangles between the field diagonals. Index = the Toggle on that wall:
 * 0 = N (red driver wall, +y), 1 = S (blue driver wall, -y), 2 = E (+x wall), 3 = W (-x wall).
 * Each holds one Alliance Goal, one Short Goal and one Toggle. The Tall Goal sits in the Midfield, in no quadrant.
 */
export const QUADRANT_NAMES = ['N', 'S', 'E', 'W'] as const;

export function quadrantOf(x: number, y: number): number {
  return Math.abs(y) >= Math.abs(x) ? (y >= 0 ? 0 : 1) : x >= 0 ? 2 : 3;
}

/** Map a point in the N quadrant into quadrant q (90-degree turns about the field center). */
const ROTATE_FROM_N: readonly ((x: number, y: number) => [number, number])[] = [
  (x, y) => [x, y],
  (x, y) => [-x, -y],
  (x, y) => [y, -x],
  (x, y) => [-y, x],
];

/** Post heights, inches (game manual). A stack may not rise above its goal. */
export const GOAL_HEIGHT: Readonly<Record<GoalKind, number>> = { alliance: 3.25, short: 5.77, tall: 8.77 };

/** Height each piece adds to a stack, inches. */
export const PIECE_STACK_HEIGHT = { pin: 1.0, cup: 0.75 } as const; // TODO: verify against game manual

export interface GoalDef {
  label: string;
  kind: GoalKind;
  alliance: Alliance | null;
  x: number;
  y: number;
  /** Base radius (collision), inches. */
  r: number;
  height: number;
  /** Yellow Pins pre-stacked on the goal at match start. */
  preloadPins: number;
}

/** Goal positions inside the N quadrant; the other quadrants are rotations of it. */
const N_SHORT = [-18, 42] as const; // TODO: verify against game manual
const N_ALLIANCE = [18, 54] as const; // TODO: verify against game manual
/** Alliance Goal color per quadrant (2 red + 2 blue, 180-degree symmetric). */
const QUADRANT_ALLIANCE: readonly Alliance[] = ['red', 'blue', 'red', 'blue']; // TODO: verify against game manual

export const GOALS: readonly GoalDef[] = [
  // TODO: verify against game manual — radii and the Tall Goal preload.
  { label: 'Tall Goal', kind: 'tall', alliance: null, x: 0, y: 0, r: 4, height: GOAL_HEIGHT.tall, preloadPins: 3 },
  ...QUADRANT_NAMES.flatMap((name, q): GoalDef[] => {
    const [sx, sy] = ROTATE_FROM_N[q](...N_SHORT);
    const [ax, ay] = ROTATE_FROM_N[q](...N_ALLIANCE);
    const al = QUADRANT_ALLIANCE[q];
    return [
      { label: `Short Goal ${name}`, kind: 'short', alliance: null, x: sx, y: sy, r: 3, height: GOAL_HEIGHT.short, preloadPins: 0 },
      { label: `${al === 'red' ? 'Red' : 'Blue'} Goal ${name}`, kind: 'alliance', alliance: al, x: ax, y: ay, r: 3, height: GOAL_HEIGHT.alliance, preloadPins: 0 },
    ];
  }),
];

export interface ToggleDef {
  x: number;
  y: number;
  /** Unit normal pointing into the field. */
  nx: number;
  ny: number;
}

/** One Toggle at the center of each perimeter wall, in QUADRANT_NAMES order. */
export const TOGGLES: readonly ToggleDef[] = [
  { x: 0, y: FIELD_HALF, nx: 0, ny: -1 }, // red driver wall
  { x: 0, y: -FIELD_HALF, nx: 0, ny: 1 }, // blue driver wall
  { x: FIELD_HALF, y: 0, nx: -1, ny: 0 },
  { x: -FIELD_HALF, y: 0, nx: 1, ny: 0 },
];
export const TOGGLE_SIZE = { width: 12, depth: 4 }; // TODO: verify against game manual

/** Midfield: diamond |x| + |y| <= halfDiagonal. A robot whose center is inside at match end scores. */
export const MIDFIELD = { halfDiagonal: 24 }; // TODO: verify against game manual (shape and size)

/** Autonomous line. A robot whose center crosses it during auton forfeits its alliance's auton bonus. */
export const AUTON_LINE_Y = 0; // TODO: verify against game manual (line location and crossing rule)

/** Starting tiles; "left"/"right" are from that alliance's driver station. Robots face the field center. */
export const STARTING_TILES: Readonly<Record<Alliance, Record<StartSide, { x: number; y: number; theta: number }>>> = {
  // TODO: verify against game manual
  red: {
    left: { x: 36, y: 60, theta: -Math.PI / 2 },
    right: { x: -36, y: 60, theta: -Math.PI / 2 },
  },
  blue: {
    left: { x: -36, y: -60, theta: Math.PI / 2 },
    right: { x: 36, y: -60, theta: Math.PI / 2 },
  },
};

/** Cup spawns on the red half; mirrored to the blue half (y -> -y). 26 + 26 = 52 neutral Cups. */
const HALF_CUPS: readonly (readonly [number, number])[] = [
  // TODO: verify against game manual — Cup count and all spawn positions.
  // ring around the Tall Goal
  [5, 9], [-5, 9], [10, 4], [-10, 4],
  [17, 24], [31, 24], [-17, 24], [-31, 24],
  [24, -17], [24, -31], [-24, -17], [-24, -31],
  // row in front of the red starting tiles
  [4, 40], [-4, 40], [12, 40], [-12, 40], [36, 40], [-36, 40], [44, 40], [-44, 40],
  // side columns
  [48, 4], [-48, 4], [48, 12], [-48, 12], [48, 28], [-48, 28],
];

export const CUP_SPAWNS: readonly { x: number; y: number }[] = [
  ...HALF_CUPS.map(([x, y]) => ({ x, y })),
  ...HALF_CUPS.map(([x, y]) => ({ x, y: -y })),
];

/** Yellow Pins on the auton line (self-symmetric). */
const LINE_PINS: readonly (readonly [number, number])[] = [
  [14, 0], [-14, 0], [36, 0], [-36, 0], [54, 0], [-54, 0], // TODO: verify against game manual
];

/**
 * Pins on the red half, mirrored to the blue half with red/blue swapped.
 * Tag: 'own' = that half's alliance color, 'opp' = the other alliance, 'y' = yellow.
 * Totals: 24 red + 24 blue + 12 yellow floor Pins, + 3 yellow preloaded on the Tall Goal = 63.
 */
type PinTag = 'own' | 'opp' | 'y';
const HALF_PINS: readonly (readonly [number, number, PinTag])[] = [
  // TODO: verify against game manual — Pin color counts and all spawn positions.
  [0, 18, 'y'], [0, 30, 'y'], [0, 48, 'y'],
  [30, 30, 'own'], [-30, 30, 'own'], [18, 30, 'own'], [-18, 30, 'own'], [30, 18, 'own'], [-30, 18, 'own'], [18, 18, 'own'], [-18, 18, 'own'],
  [12, 48, 'own'], [-12, 48, 'own'], [24, 48, 'own'], [-24, 48, 'own'],
  [60, 10, 'opp'], [-60, 10, 'opp'], [60, 20, 'opp'], [-60, 20, 'opp'],
  [64, 64, 'own'], [-64, 64, 'own'], [56, 64, 'own'], [-56, 64, 'own'],
  [40, 28, 'own'], [-40, 28, 'own'], [40, 8, 'own'], [-40, 8, 'own'],
];

const tagColor = (t: PinTag, own: Alliance): PinColor => (t === 'y' ? 'yellow' : t === 'own' ? own : own === 'red' ? 'blue' : 'red');

export const PIN_SPAWNS: readonly { x: number; y: number; color: PinColor }[] = [
  ...LINE_PINS.map(([x, y]) => ({ x, y, color: 'yellow' as const })),
  ...HALF_PINS.map(([x, y, t]) => ({ x, y, color: tagColor(t, 'red') })),
  ...HALF_PINS.map(([x, y, t]) => ({ x, y: -y, color: tagColor(t, 'blue') })),
];

/** Point values (game manual). */
export const SCORING = {
  /** Red/blue Pin in any goal, to that alliance. */
  alliancePin: 5,
  /** Yellow Pin in a goal, to the alliance owning the Toggle in that goal's quadrant. */
  yellowPin: 10,
  /** Per robot inside the Midfield at match end. */
  midfieldRobot: 8,
  /** To the alliance with more autonomous points; split evenly on a tie. */
  autonBonus: 12,
} as const;

/** Final seconds of driver control shown as ENDGAME. */
export const ENDGAME_SEC = 10;

export type CupCoverRule = 'pin-below' | 'none';
export type TallYellowRule = 'midfield-majority' | 'none';

/** Rules not yet confirmed by the game manual. Mutable so tests and tinkering can switch them. */
export const RULES: { cupCover: CupCoverRule; tallYellowOwner: TallYellowRule } = {
  /** 'pin-below': a Cup on a stack covers the Pin directly beneath it, and a covered Pin scores nothing. */
  cupCover: 'pin-below', // TODO: verify against game manual
  /** 'midfield-majority': yellow Pins on the Tall Goal score for the alliance with more robots in the Midfield (nobody on a tie). */
  tallYellowOwner: 'midfield-majority', // TODO: verify against game manual
};

export const MATCH_TIMING = {
  autonSec: 15, // TODO: verify against game manual
  transitionSec: 3,
  driverSec: 105, // TODO: verify against game manual
  skillsSec: 60, // TODO: verify against game manual
} as const;
