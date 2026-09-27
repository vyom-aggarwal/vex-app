import type { V2 } from '../shared/math';
import type { Alliance, HalfColor } from '../shared/types';
import type { DetentDef, LoaderDef, ObjectSpawn, TapeDef } from '../engine/types';

/** Helpers shared by game definitions (all inches, spec frame: +y toward the red station). */

export const rect = (x0: number, y0: number, x1: number, y1: number): V2[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

export const tape = (ax: number, ay: number, bx: number, by: number, color: TapeDef['color'] = 'white', width = 1): TapeDef => ({
  a: { x: ax, y: ay },
  b: { x: bx, y: by },
  width,
  color,
});

/** A double tape line (two parallel strips `gap` apart, outer edge to outer edge). */
export function doubleTape(ax: number, ay: number, bx: number, by: number, overall = 2.5, width = 0.75): TapeDef[] {
  const len = Math.hypot(bx - ax, by - ay);
  const nx = -(by - ay) / len;
  const ny = (bx - ax) / len;
  const o = overall / 2 - width / 2;
  return [tape(ax + nx * o, ay + ny * o, bx + nx * o, by + ny * o, 'white', width), tape(ax - nx * o, ay - ny * o, bx - nx * o, by - ny * o, 'white', width)];
}

/** Wall-mounted triangular toggle / roller at the middle of a wall. */
export function wallDetent(
  id: string,
  kind: DetentDef['kind'],
  wall: '+x' | '-x' | '+y' | '-y',
  region: string,
  colors: { zero: HalfColor; plus: HalfColor; minus: HalfColor },
  opts: { half: number; z: number; length: number; side: number; overhang: number },
): DetentDef {
  const d = opts.half - opts.overhang;
  const map = {
    '+x': { p: { x: d, y: 0 }, n: { x: -1, y: 0 } },
    '-x': { p: { x: -d, y: 0 }, n: { x: 1, y: 0 } },
    '+y': { p: { x: 0, y: d }, n: { x: 0, y: -1 } },
    '-y': { p: { x: 0, y: -d }, n: { x: 0, y: 1 } },
  }[wall];
  return {
    id,
    kind,
    region,
    pivot: { ...map.p, z: opts.z },
    inward: map.n,
    length: opts.length,
    side: opts.side,
    detents: [
      { color: colors.zero, angle: 0 },
      { color: colors.plus, angle: 120 },
      { color: colors.minus, angle: -120 },
    ],
    start: colors.zero,
    continuous: true,
  };
}

/** Loader on the red (+y) or blue (-y) wall. */
export function wallLoader(id: string, alliance: Alliance, x: number, half: number, zone: V2[] | null): LoaderDef {
  const s = alliance === 'red' ? 1 : -1;
  const d = 3.74;
  const front = half - d;
  return { id, alliance, x, y: s * (half - d / 2), w: 4.02, d, h: 14.37, exit: { x, y: s * (front - 1.9) }, zone };
}

export const cup = (x: number, y: number, up: 'clear' | 'opaque', extra: Partial<ObjectSpawn> = {}): ObjectSpawn => ({
  kind: 'cup',
  x,
  y,
  upright: true,
  cupUp: up,
  ...extra,
});

export const pinUp = (pin: ObjectSpawn['pin'], x: number, y: number, top: HalfColor, extra: Partial<ObjectSpawn> = {}): ObjectSpawn => ({
  kind: 'pin',
  pin,
  x,
  y,
  upright: true,
  topColor: top,
  ...extra,
});

/** Lying pin: `endColor` end points toward `dirDeg`. */
export const pinLying = (pin: ObjectSpawn['pin'], x: number, y: number, dirDeg: number, endColor: HalfColor, extra: Partial<ObjectSpawn> = {}): ObjectSpawn => ({
  kind: 'pin',
  pin,
  x,
  y,
  upright: false,
  lyingDir: dirDeg,
  topColor: endColor,
  ...extra,
});
