import RAPIER from '@dimforge/rapier3d-compat';
import { inToM } from '../shared/units';
import { CUP, GOAL, PIN } from './pieces';

export { RAPIER };
export type Vec3 = { x: number; y: number; z: number };
export type Quat = { x: number; y: number; z: number; w: number };

let ready: Promise<void> | null = null;
/** Initialise the Rapier WASM module once (works in the browser and in Node). */
export function loadPhysics(): Promise<void> {
  ready ??= RAPIER.init();
  return ready;
}

/** Collision membership bits. InteractionGroups = (membership << 16) | filter. */
export const GRP = {
  field: 1,
  obj: 2,
  stacked: 4,
  detent: 8,
  robot: (i: number): number => 16 << i,
  robotsAll: 16 | 32 | 64 | 128,
};
export const groups = (member: number, filter: number): number => ((member & 0xffff) << 16) | (filter & 0xffff);

export const G_FIELD = groups(GRP.field, 0xffff);
export const G_OBJ = groups(GRP.obj, 0xffff);
export const G_STACKED = groups(GRP.stacked, GRP.obj | GRP.robotsAll);
export const G_HELD = groups(GRP.obj, GRP.obj | GRP.detent);
export const G_NONE = groups(0, 0);
export const G_DETENT = groups(GRP.detent, 0xffff & ~GRP.field);
export const robotGroups = (i: number): number =>
  groups(GRP.robot(i), GRP.field | GRP.obj | GRP.stacked | GRP.detent | (GRP.robotsAll & ~GRP.robot(i)));

// ---------------------------------------------------------------------------------------------
// Quaternion helpers
// ---------------------------------------------------------------------------------------------

export function quatAxisAngle(ax: Vec3, a: number): Quat {
  const s = Math.sin(a / 2);
  return { x: ax.x * s, y: ax.y * s, z: ax.z * s, w: Math.cos(a / 2) };
}
export const quatYaw = (th: number): Quat => ({ x: 0, y: 0, z: Math.sin(th / 2), w: Math.cos(th / 2) });
export const yawOf = (q: Quat): number => Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z));

export function quatMul(a: Quat, b: Quat): Quat {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

/** Rotate v by q. */
export function quatRotate(q: Quat, v: Vec3): Vec3 {
  const { x, y, z, w } = q;
  const ix = w * v.x + y * v.z - z * v.y;
  const iy = w * v.y + z * v.x - x * v.z;
  const iz = w * v.z + x * v.y - y * v.x;
  const iw = -x * v.x - y * v.y - z * v.z;
  return {
    x: ix * w + iw * -x + iy * -z - iz * -y,
    y: iy * w + iw * -y + iz * -x - ix * -z,
    z: iz * w + iw * -z + ix * -y - iy * -x,
  };
}

/** World direction of a body's local +z axis (a piece's half-0 / clear end). */
export const upAxis = (q: Quat): Vec3 => quatRotate(q, { x: 0, y: 0, z: 1 });

/** Rotation taking local +z to the unit vector d. */
export function quatFromZ(d: Vec3): Quat {
  const dot = d.z;
  if (dot > 0.999999) return { x: 0, y: 0, z: 0, w: 1 };
  if (dot < -0.999999) return { x: 1, y: 0, z: 0, w: 0 };
  // axis = z × d
  const ax = { x: -d.y, y: d.x, z: 0 };
  const len = Math.hypot(ax.x, ax.y);
  return quatAxisAngle({ x: ax.x / len, y: ax.y / len, z: 0 }, Math.acos(dot));
}

// ---------------------------------------------------------------------------------------------
// Shapes (points in meters)
// ---------------------------------------------------------------------------------------------

function ring(r: number, z: number, n: number, phase = 0): number[] {
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2;
    pts.push(r * Math.cos(a), r * Math.sin(a), z);
  }
  return pts;
}

/** Octagonal prism from z=0 to z=h (inches in, meters out), across-flats w. */
export function octagonPoints(wIn: number, hIn: number): Float32Array {
  const r = inToM(wIn / 2 / Math.cos(Math.PI / 8));
  return new Float32Array([...ring(r, 0, 8, Math.PI / 8), ...ring(r, inToM(hIn), 8, Math.PI / 8)]);
}

/** Truncated cone between z0 and z1 with radii r0, r1 (inches). */
export function frustumPoints(r0: number, z0: number, r1: number, z1: number, n = 10): Float32Array {
  return new Float32Array([...ring(inToM(r0), inToM(z0), n), ...ring(inToM(r1), inToM(z1), n)]);
}

/** Pin collider parts, centered on the collar, local +z = half 0. */
export function pinParts(): Float32Array[] {
  const c = PIN.collarThick / 2;
  return [
    frustumPoints(PIN.coneBase / 2, c, PIN.tip / 2, PIN.half),
    frustumPoints(PIN.coneBase / 2, -c, PIN.tip / 2, -PIN.half),
    new Float32Array([...ring(inToM(PIN.collarAC / 2), inToM(-c), 6), ...ring(inToM(PIN.collarAC / 2), inToM(c), 6)]),
  ];
}

/** Cup collider parts, centered at the waist, local +z = clear half. */
export function cupParts(): Float32Array[] {
  return [frustumPoints(CUP.waist / 2, 0, CUP.rim / 2, CUP.half), frustumPoints(CUP.waist / 2, 0, CUP.rim / 2, -CUP.half)];
}

export const GOAL_WIDTH = GOAL.width;
