import type { FieldDef, GoalDef, ObjectSpawn, StartPose } from '../../engine/types';
import { cup, doubleTape, pinLying, pinUp, rect, tape, wallDetent, wallLoader } from '../common';

/**
 * Override field, from docs/games/override.md rotated into the spec frame ((x, y) → (y, −x)):
 * +y toward the red station, −x toward the audience. Quadrants: L (red wall, red), A (audience, red),
 * F (far wall, blue), R (blue wall, blue). The Autonomous Line runs along y = x; red's side is y > x.
 */

export const SIZE = 140.41;
export const HALF = SIZE / 2;
const G = 23.55;
const G2 = 47.1;

const goal = (id: string, kind: GoalDef['kind'], owner: GoalDef['owner'], x: number, y: number, height: number, region: string): GoalDef => ({
  id,
  kind,
  owner,
  x,
  y,
  height,
  width: 5.61,
  opening: 2.37,
  region,
});

export const GOALS: GoalDef[] = [
  goal('G0', 'center', null, 0, 0, 8.77, 'MID'),
  goal('L1', 'alliance', 'red', -G, G2, 3.25, 'L'),
  goal('L2', 'neutral', null, G, G2, 5.77, 'L'),
  goal('A1', 'alliance', 'red', -G2, G, 3.25, 'A'),
  goal('A2', 'neutral', null, -G2, -G, 5.77, 'A'),
  goal('F1', 'neutral', null, G2, G, 5.77, 'F'),
  goal('F2', 'alliance', 'blue', G2, -G, 3.25, 'F'),
  goal('R1', 'alliance', 'blue', G, -G2, 3.25, 'R'),
  goal('R2', 'neutral', null, -G, -G2, 5.77, 'R'),
];

/** Toggle per quadrant: yellow at start; +120° shows the opposing color, −120° the quadrant's own color. */
const TOGGLE = { half: HALF, z: 13.2, length: 26, side: 2.34, overhang: 0.4 };
export const QUAD_COLOR = { L: 'red', A: 'red', F: 'blue', R: 'blue' } as const;
const detents = [
  wallDetent('T_L', 'toggle', '+y', 'L', { zero: 'yellow', plus: 'blue', minus: 'red' }, TOGGLE),
  wallDetent('T_A', 'toggle', '-x', 'A', { zero: 'yellow', plus: 'blue', minus: 'red' }, TOGGLE),
  wallDetent('T_F', 'toggle', '+x', 'F', { zero: 'yellow', plus: 'red', minus: 'blue' }, TOGGLE),
  wallDetent('T_R', 'toggle', '-y', 'R', { zero: 'yellow', plus: 'red', minus: 'blue' }, TOGGLE),
];

// Load Zones: between the perimeter and the colored tape around each loader (EST bounds).
const LZ_X = 46.6;
const LZ_Y = 58.5;
const zone = (sx: number, sy: number) => rect(sx * LZ_X, sy * LZ_Y, sx * HALF, sy * HALF);

export const FIELD: FieldDef = {
  size: SIZE,
  wallHeight: 11.54,
  goals: GOALS,
  detents,
  loaders: [
    wallLoader('LR1', 'red', 58.77, HALF, zone(1, 1)),
    wallLoader('LR2', 'red', -58.77, HALF, zone(-1, 1)),
    wallLoader('LB1', 'blue', 58.77, HALF, zone(1, -1)),
    wallLoader('LB2', 'blue', -58.77, HALF, zone(-1, -1)),
  ],
  regions: [
    { id: 'L', label: 'Red quadrant (station wall)', color: 'red', poly: [{ x: 0, y: 0 }, { x: HALF, y: HALF }, { x: -HALF, y: HALF }] },
    { id: 'A', label: 'Red quadrant (audience wall)', color: 'red', poly: [{ x: 0, y: 0 }, { x: -HALF, y: HALF }, { x: -HALF, y: -HALF }] },
    { id: 'F', label: 'Blue quadrant (far wall)', color: 'blue', poly: [{ x: 0, y: 0 }, { x: HALF, y: -HALF }, { x: HALF, y: HALF }] },
    { id: 'R', label: 'Blue quadrant (station wall)', color: 'blue', poly: [{ x: 0, y: 0 }, { x: -HALF, y: -HALF }, { x: HALF, y: -HALF }] },
  ],
  tape: [
    // Midfield diamond (tape centerline on the tile corners).
    tape(23.4, 0, 0, 23.4),
    tape(0, 23.4, -23.4, 0),
    tape(-23.4, 0, 0, -23.4),
    tape(0, -23.4, 23.4, 0),
    // Autonomous Line (double) along y = x; Quadrant divider along y = -x.
    ...doubleTape(11.7, 11.7, 58.5, 58.5),
    ...doubleTape(-11.7, -11.7, -58.5, -58.5),
    tape(-11.7, 11.7, -58.5, 58.5),
    tape(11.7, -11.7, 58.5, -58.5),
    // Load Zone tape.
    ...[1, -1].flatMap((sx) =>
      [1, -1].flatMap((sy) => {
        const c = sy > 0 ? 'red' : 'blue';
        return [tape(sx * LZ_X, sy * LZ_Y, sx * HALF, sy * LZ_Y, c), tape(sx * LZ_X, sy * LZ_Y, sx * LZ_X, sy * HALF, c)];
      }),
    ),
  ],
  midfield: [
    { x: 22.72, y: 0 },
    { x: 0, y: 22.72 },
    { x: -22.72, y: 0 },
    { x: 0, y: -22.72 },
  ],
  autonLine: { n: { x: -Math.SQRT1_2, y: Math.SQRT1_2 }, c: 0 },
  stations: [
    { alliance: 'red', x: 0, y: HALF + 30 },
    { alliance: 'blue', x: 0, y: -HALF - 30 },
  ],
};

/** Head-to-head starting objects (FO-2), in the spec frame. */
export function matchLayout(withGoalPins: boolean): ObjectSpawn[] {
  const out: ObjectSpawn[] = [];
  const add = (s: ObjectSpawn): number => out.push(s) - 1;
  // Wall clusters: 3 gray-up cups along the wall, the middle one with a yellow Pin nested in it.
  const clusters: [number, number, 'x' | 'y'][] = [
    [68.62, G, 'y'],
    [68.62, -G, 'y'],
    [-68.62, G, 'y'],
    [-68.62, -G, 'y'],
    [G, 68.62, 'x'],
    [-G, 68.62, 'x'],
    [G, -68.62, 'x'],
    [-G, -68.62, 'x'],
  ];
  for (const [x, y, along] of clusters) {
    const dx = along === 'x' ? 3.16 : 0;
    const dy = along === 'y' ? 3.16 : 0;
    add(cup(x - dx, y - dy, 'opaque'));
    const mid = add(cup(x, y, 'opaque'));
    add(pinUp('YY', x, y, 'yellow', { rideOn: mid }));
    add(cup(x + dx, y + dy, 'opaque'));
  }
  // Crosses on the Autonomous Line: clear-up cup with four lying pins, yellow ends inward.
  for (const c of [47.1, 23.55, -23.55, -47.1]) {
    const o = { onLine: true };
    add(cup(c, c, 'clear', o));
    add(pinLying('RY', c, c + 4.75, 90, 'red', o));
    add(pinLying('RY', c - 4.75, c, 180, 'red', o));
    add(pinLying('BY', c, c - 4.75, -90, 'blue', o));
    add(pinLying('BY', c + 4.75, c, 0, 'blue', o));
  }
  // Quadrant-divider diagonal: clear-up cup with a yellow Pin.
  for (const c of [47.1, 23.55, -23.55, -47.1]) {
    const k = add(cup(-c, c, 'clear'));
    add(pinUp('YY', -c, c, 'yellow', { rideOn: k }));
  }
  // Midfield vertices (on the Autonomous Line): clear-up cup + red/blue Pin.
  for (const [x, y, top] of [
    [G, 0, 'blue'],
    [0, -G, 'blue'],
    [0, G, 'red'],
    [-G, 0, 'red'],
  ] as const) {
    const k = add(cup(x, y, 'clear', { onLine: true }));
    add(pinUp('RB', x, y, top, { rideOn: k, onLine: true }));
  }
  if (withGoalPins) for (const g of GOALS.filter((g) => g.kind !== 'alliance')) add(pinUp('YY', g.x, g.y, 'yellow', { nestIn: g.id }));
  return out;
}

/** SG1 starting spots: one robot per quadrant, against the perimeter, clear of goals, loaders and toggles. */
export const STARTS: StartPose[] = [
  { alliance: 'red', x: -37.5, y: HALF, th: -90 },
  { alliance: 'red', x: -HALF, y: 37.5, th: 0 },
  { alliance: 'blue', x: 37.5, y: -HALF, th: 90 },
  { alliance: 'blue', x: HALF, y: -37.5, th: 180 },
];
