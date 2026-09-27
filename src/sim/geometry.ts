import type { LocalBox } from './types';

/** Oriented box in field space: center, unit forward axis (left axis = (-fy, fx)), half extents. */
export interface Obb {
  x: number;
  y: number;
  fx: number;
  fy: number;
  hx: number;
  hy: number;
}

/** Contact: unit normal and penetration depth. */
export interface Hit {
  nx: number;
  ny: number;
  depth: number;
}

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export function wrapAngle(a: number): number {
  a %= 2 * Math.PI;
  if (a > Math.PI) a -= 2 * Math.PI;
  else if (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

export function localToObb(b: LocalBox, x: number, y: number, theta: number): Obb {
  const fx = Math.cos(theta);
  const fy = Math.sin(theta);
  return { x: x + b.cx * fx - b.cy * fy, y: y + b.cx * fy + b.cy * fx, fx, fy, hx: b.hx, hy: b.hy };
}

export function aabbObb(cx: number, cy: number, hx: number, hy: number): Obb {
  return { x: cx, y: cy, fx: 1, fy: 0, hx, hy };
}

/** Half-size of the box's axis-aligned bounds. */
export function obbExtent(o: Obb): { ex: number; ey: number } {
  const ax = Math.abs(o.fx);
  const ay = Math.abs(o.fy);
  return { ex: o.hx * ax + o.hy * ay, ey: o.hx * ay + o.hy * ax };
}

/** Circle vs box. Normal points from the box toward the circle. */
export function circleVsObb(px: number, py: number, r: number, o: Obb): Hit | null {
  const dx = px - o.x;
  const dy = py - o.y;
  const lx = dx * o.fx + dy * o.fy;
  const ly = -dx * o.fy + dy * o.fx;
  const qx = clamp(lx, -o.hx, o.hx);
  const qy = clamp(ly, -o.hy, o.hy);
  const ex = lx - qx;
  const ey = ly - qy;
  const d2 = ex * ex + ey * ey;
  if (d2 >= r * r) return null;
  let nlx: number;
  let nly: number;
  let depth: number;
  if (d2 > 1e-12) {
    const d = Math.sqrt(d2);
    nlx = ex / d;
    nly = ey / d;
    depth = r - d;
  } else {
    // center inside the box: exit through the nearest face
    const gapX = o.hx - Math.abs(lx);
    const gapY = o.hy - Math.abs(ly);
    if (gapX < gapY) {
      nlx = lx < 0 ? -1 : 1;
      nly = 0;
      depth = gapX + r;
    } else {
      nlx = 0;
      nly = ly < 0 ? -1 : 1;
      depth = gapY + r;
    }
  }
  return { nx: nlx * o.fx - nly * o.fy, ny: nlx * o.fy + nly * o.fx, depth };
}

/** Separating-axis test for two boxes. Normal points from a toward b. */
export function obbVsObb(a: Obb, b: Obb): Hit | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let best = Infinity;
  let bnx = 0;
  let bny = 0;
  for (let i = 0; i < 4; i++) {
    const src = i < 2 ? a : b;
    const ax = i % 2 === 0 ? src.fx : -src.fy;
    const ay = i % 2 === 0 ? src.fy : src.fx;
    const ra = a.hx * Math.abs(ax * a.fx + ay * a.fy) + a.hy * Math.abs(-ax * a.fy + ay * a.fx);
    const rb = b.hx * Math.abs(ax * b.fx + ay * b.fy) + b.hy * Math.abs(-ax * b.fy + ay * b.fx);
    const dist = dx * ax + dy * ay;
    const overlap = ra + rb - Math.abs(dist);
    if (overlap <= 0) return null;
    if (overlap < best) {
      best = overlap;
      const sgn = dist < 0 ? -1 : 1;
      bnx = ax * sgn;
      bny = ay * sgn;
    }
  }
  return { nx: bnx, ny: bny, depth: best };
}
