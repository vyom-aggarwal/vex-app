import type { FieldDef, GoalDef, ObjectSpawn, StartPose } from '../../engine/types';
import { cup, pinLying, pinUp, rect, tape, wallDetent, wallLoader } from '../common';

/**
 * Pinnacle field, from docs/games/pinnacle.md rotated into the spec frame ((x, y) → (y, −x)).
 * Zones: RED y > 23.4, BLUE y < −23.4, neutral N1 x > 23.4, N2 x < −23.4, center C. All coordinates EST.
 */

export const SIZE = 140.4;
export const HALF = SIZE / 2;
const T = 23.4;
const T2 = 46.8;

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
  goal('R1', 'alliance', 'red', T, T2, 3.25, 'RED'),
  goal('R2', 'alliance', 'red', -T, T2, 3.25, 'RED'),
  goal('B1', 'alliance', 'blue', T, -T2, 3.25, 'BLUE'),
  goal('B2', 'alliance', 'blue', -T, -T2, 3.25, 'BLUE'),
  goal('N1', 'neutral', null, T2, 0, 5.77, 'N1'),
  goal('N2', 'neutral', null, -T2, 0, 5.77, 'N2'),
  goal('C', 'center', null, 0, 0, 8.77, 'C'),
];

/** Zone → roller id. The center goal has no roller. */
export const ROLLER_OF: Record<string, string | null> = { RED: 'RO_R', BLUE: 'RO_B', N1: 'RO_N1', N2: 'RO_N2', C: null };

const ROLLER = { half: HALF, z: 13.2, length: 25.6, side: 2.34, overhang: 0.4 };

export const FIELD: FieldDef = {
  size: SIZE,
  wallHeight: 11.54,
  goals: GOALS,
  detents: [
    wallDetent('RO_R', 'roller', '+y', 'RED', { zero: 'yellow', plus: 'blue', minus: 'red' }, ROLLER),
    wallDetent('RO_B', 'roller', '-y', 'BLUE', { zero: 'yellow', plus: 'red', minus: 'blue' }, ROLLER),
    wallDetent('RO_N1', 'roller', '+x', 'N1', { zero: 'yellow', plus: 'red', minus: 'blue' }, ROLLER),
    wallDetent('RO_N2', 'roller', '-x', 'N2', { zero: 'yellow', plus: 'blue', minus: 'red' }, ROLLER),
  ],
  loaders: [
    wallLoader('LR1', 'red', 58.8, HALF, null),
    wallLoader('LR2', 'red', -58.8, HALF, null),
    wallLoader('LB1', 'blue', 58.8, HALF, null),
    wallLoader('LB2', 'blue', -58.8, HALF, null),
  ],
  regions: [
    { id: 'RED', label: 'Red zone', color: 'red', poly: rect(-HALF, T, HALF, HALF) },
    { id: 'BLUE', label: 'Blue zone', color: 'blue', poly: rect(-HALF, -HALF, HALF, -T) },
    { id: 'N1', label: 'Neutral zone 1', color: null, poly: rect(T, -T, HALF, T) },
    { id: 'N2', label: 'Neutral zone 2', color: null, poly: rect(-HALF, -T, -T, T) },
    { id: 'C', label: 'Center zone', color: null, poly: rect(-T, -T, T, T) },
  ],
  tape: [tape(-HALF, T, HALF, T), tape(-HALF, -T, HALF, -T), tape(T, -T, T, T), tape(-T, -T, -T, T)],
  midfield: null,
  autonLine: { n: { x: 0, y: 1 }, c: 0 },
  stations: [
    { alliance: 'red', x: 0, y: HALF + 30 },
    { alliance: 'blue', x: 0, y: -HALF - 30 },
  ],
};

/** Starting objects (identical for solo and alliance setups). */
export function layout(): ObjectSpawn[] {
  const out: ObjectSpawn[] = [];
  const add = (s: ObjectSpawn): number => out.push(s) - 1;
  // Wall clusters: 3 cups along the red / blue walls; outer two opaque-up, middle clear-up with a red/blue Pin.
  for (const [cx, cy, top] of [
    [35.1, 68.6, 'blue'],
    [-35.1, 68.6, 'blue'],
    [35.1, -68.6, 'red'],
    [-35.1, -68.6, 'red'],
  ] as const) {
    add(cup(cx - 3.1, cy, 'opaque'));
    const mid = add(cup(cx, cy, 'clear'));
    add(pinUp('RB', cx, cy, top, { rideOn: mid }));
    add(cup(cx + 3.1, cy, 'opaque'));
  }
  for (const [x, y] of [
    [T, 0],
    [-T, 0],
    [0, T2],
    [0, -T2],
  ])
    add(cup(x, y, 'clear'));
  add(pinUp('YY', 0, 0, 'yellow', { nestIn: 'C' }));
  // Lying pins beside the alliance goals.
  const lying: [ObjectSpawn['pin'], number, number, number, 'red' | 'blue' | 'yellow'][] = [
    ['RY', 50.05, T2, 0, 'red'],
    ['BY', 43.55, T2, 180, 'blue'],
    ['BY', -43.55, T2, 0, 'blue'],
    ['RY', -50.05, T2, 180, 'red'],
    ['BY', 50.05, -T2, 0, 'blue'],
    ['RY', 43.55, -T2, 180, 'red'],
    ['RY', -43.55, -T2, 0, 'red'],
    ['BY', -50.05, -T2, 180, 'blue'],
    // Center-zone corner pairs: colored end outward, yellow ends meeting at the tape corner.
    ['BY', 25.7, 25.7, 45, 'blue'],
    ['YY', 21.1, 21.1, 45, 'yellow'],
    ['BY', 25.7, -25.7, -45, 'blue'],
    ['YY', 21.1, -21.1, -45, 'yellow'],
    ['RY', -25.7, 25.7, 135, 'red'],
    ['YY', -21.1, 21.1, 135, 'yellow'],
    ['RY', -25.7, -25.7, -135, 'red'],
    ['YY', -21.1, -21.1, -135, 'yellow'],
  ];
  for (const [p, x, y, dir, c] of lying) add(pinLying(p, x, y, dir, c));
  return out;
}

/** Robots start touching one of their alliance's Loaders (back against its front face). */
const LOADER_FACE = HALF - 3.74;
export const STARTS: StartPose[] = [
  { alliance: 'red', x: 55, y: LOADER_FACE, th: -90 },
  { alliance: 'red', x: -55, y: LOADER_FACE, th: -90 },
  { alliance: 'blue', x: 55, y: -LOADER_FACE, th: 90 },
  { alliance: 'blue', x: -55, y: -LOADER_FACE, th: 90 },
];
