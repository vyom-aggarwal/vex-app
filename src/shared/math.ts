export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Wrap an angle to (-π, π]. */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a - Math.PI;
}
export function lerpAngle(a: number, b: number, t: number): number {
  return a + wrapAngle(b - a) * t;
}
export interface V2 {
  x: number;
  y: number;
}
export const v2 = (x: number, y: number): V2 => ({ x, y });
export const dist2 = (a: V2, b: V2): number => Math.hypot(a.x - b.x, a.y - b.y);
/** Rotate a local (x, y) by heading θ. */
export function rot2(x: number, y: number, th: number): V2 {
  const c = Math.cos(th);
  const s = Math.sin(th);
  return { x: c * x - s * y, y: s * x + c * y };
}
/** Point-in-convex/concave polygon (even-odd). */
export function pointInPoly(p: V2, poly: V2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
/** Corners of an oriented rectangle (center, half-length along heading, half-width). */
export function rectCorners(cx: number, cy: number, th: number, hl: number, hw: number): V2[] {
  return [
    [hl, hw],
    [-hl, hw],
    [-hl, -hw],
    [hl, -hw],
  ].map(([x, y]) => {
    const r = rot2(x, y, th);
    return { x: cx + r.x, y: cy + r.y };
  });
}
/** Separating-axis test between two convex polygons. */
export function polysOverlap(a: V2[], b: V2[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const nx = q.y - p.y;
      const ny = p.x - q.x;
      let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
      for (const v of a) {
        const d = v.x * nx + v.y * ny;
        amin = Math.min(amin, d);
        amax = Math.max(amax, d);
      }
      for (const v of b) {
        const d = v.x * nx + v.y * ny;
        bmin = Math.min(bmin, d);
        bmax = Math.max(bmax, d);
      }
      if (amax < bmin || bmax < amin) return false;
    }
  }
  return true;
}
/** Cheap deterministic 32-bit FNV-1a hash of a string. */
export function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
